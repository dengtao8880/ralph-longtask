import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadRunState,
  saveRunState,
  registerPersistentStorySkip,
  clearPersistentStoryState,
  applyRetryStories,
  pruneCompletedStories,
} from '../lib/run-state.js';

const TEST_DIR = join(tmpdir(), `ralph-test-run-state-${Date.now()}`);

describe('run-state', () => {
  before(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  after(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('returns an empty state when the file does not exist', () => {
    const state = loadRunState(join(TEST_DIR, 'missing-state.json'));
    assert.deepEqual(state, { skippedStories: {} });
  });

  it('saves and reloads skipped stories', () => {
    const statePath = join(TEST_DIR, 'state.json');
    const state = {
      skippedStories: {
        'US-001': {
          reason: 'max-failures-per-story',
          failureCount: 3,
        },
      },
    };

    saveRunState(statePath, state);
    const reloaded = loadRunState(statePath);

    assert.equal(reloaded.skippedStories['US-001'].failureCount, 3);
    assert.equal(reloaded.skippedStories['US-001'].reason, 'max-failures-per-story');
  });

  it('registers persistent skips with failure counts', () => {
    const state = { skippedStories: {} };
    registerPersistentStorySkip(state, 'US-002', { failureCount: 4 });

    assert.equal(state.skippedStories['US-002'].failureCount, 4);
    assert.equal(state.skippedStories['US-002'].reason, 'max-failures-per-story');
    assert.ok(state.skippedStories['US-002'].skippedAt);
  });

  it('clears persistent state for a specific story', () => {
    const state = {
      skippedStories: {
        'US-001': { reason: 'max-failures-per-story', failureCount: 3 },
        'US-002': { reason: 'max-failures-per-story', failureCount: 2 },
      },
    };

    clearPersistentStoryState(state, 'US-001');

    assert.equal(state.skippedStories['US-001'], undefined);
    assert.ok(state.skippedStories['US-002']);
  });

  it('applies retry stories by removing them from persistent skips', () => {
    const state = {
      skippedStories: {
        'US-001': { reason: 'max-failures-per-story', failureCount: 3 },
        'US-003': { reason: 'max-failures-per-story', failureCount: 3 },
      },
    };

    applyRetryStories(state, ['US-003']);

    assert.ok(state.skippedStories['US-001']);
    assert.equal(state.skippedStories['US-003'], undefined);
  });

  it('prunes stories that already pass in prd.json', () => {
    const state = {
      skippedStories: {
        'US-001': { reason: 'max-failures-per-story', failureCount: 3 },
        'US-002': { reason: 'max-failures-per-story', failureCount: 1 },
      },
    };
    const prd = {
      userStories: [
        { id: 'US-001', passes: true },
        { id: 'US-002', passes: false },
      ],
    };

    pruneCompletedStories(state, prd);

    assert.equal(state.skippedStories['US-001'], undefined);
    assert.ok(state.skippedStories['US-002']);
  });

  it('falls back to an empty state when the file is corrupted', () => {
    const statePath = join(TEST_DIR, 'corrupted.json');
    writeFileSync(statePath, '{ invalid json', 'utf-8');

    const state = loadRunState(statePath);

    assert.deepEqual(state, { skippedStories: {} });
  });
});
