import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDryRunReport,
  parseArgs,
  shouldStopForRuntimeBudget,
  registerStoryFailure,
} from '../ralph.js';

const RALPH_SCRIPT = fileURLToPath(new URL('../ralph.js', import.meta.url));

function createTempProject() {
  return mkdtempSync(join(tmpdir(), 'ralph-cli-test-'));
}

describe('ralph cli entrypoint', () => {
  it('prints help and exits successfully', () => {
    const result = spawnSync(process.execPath, [RALPH_SCRIPT, '--help'], {
      encoding: 'utf-8',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage:/);
    assert.match(result.stdout, /--version, -v/);
    assert.match(result.stdout, /--dry-run/);
    assert.match(result.stdout, /--max-total-tokens/);
    assert.match(result.stdout, /--max-total-cost-usd/);
    assert.match(result.stdout, /ralph pipeline --help/);
  });

  it('prints version and exits successfully', () => {
    const result = spawnSync(process.execPath, [RALPH_SCRIPT, '--version'], {
      encoding: 'utf-8',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/);
  });

  it('prints budget guardrails in dry-run output when configured', () => {
    const projectDir = createTempProject();
    try {
      writeFileSync(join(projectDir, 'prd.json'), JSON.stringify({
        userStories: [
          { id: 'US-001', title: 'First story', passes: false, priority: 1 },
          { id: 'US-002', title: 'Second story', passes: false, priority: 2 },
        ],
      }, null, 2));

      const result = spawnSync(process.execPath, [
        RALPH_SCRIPT,
        '--config',
        projectDir,
        '--dry-run',
        '--max-total-tokens',
        '12000',
      ], {
        cwd: projectDir,
        encoding: 'utf-8',
      });

      assert.equal(result.status, 0);
      assert.match(result.stdout, /Ralph dry run preview/);
      assert.match(result.stdout, /Budget guardrails: max 12,000 tokens/);
      assert.match(result.stdout, /Eligible execution order:/);
      assert.match(result.stdout, /US-001/);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('fails fast when a cost budget is configured without token pricing', () => {
    const projectDir = createTempProject();
    try {
      const result = spawnSync(process.execPath, [
        RALPH_SCRIPT,
        '--config',
        projectDir,
        '--max-total-cost-usd',
        '2.5',
      ], {
        cwd: projectDir,
        encoding: 'utf-8',
      });

      assert.equal(result.status, 1);
      assert.match(result.stderr, /Budget config error:/);
      assert.match(result.stderr, /requires inputCostPer1kTokensUsd or outputCostPer1kTokensUsd/i);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});

describe('parseArgs', () => {
  it('parses targeted story and repeatable skip flags', () => {
    const result = parseArgs([
      'node',
      'ralph.js',
      '--story',
      'US-007',
      '--skip-story',
      'US-001',
      '--skip-story',
      'US-003',
      '--max-runtime-minutes',
      '45',
      '--max-failures-per-story',
      '2',
    ]);

    assert.equal(result.storyId, 'US-007');
    assert.deepEqual(result.skipStories, ['US-001', 'US-003']);
    assert.equal(result.maxRuntimeMinutes, 45);
    assert.equal(result.maxFailuresPerStory, 2);
  });

  it('reports an error when the same story is both selected and skipped', () => {
    const result = parseArgs([
      'node',
      'ralph.js',
      '--story',
      'US-001',
      '--skip-story',
      'US-001',
    ]);

    assert.match(result.error, /cannot both target and skip/i);
  });

  it('parses repeatable retry-story flags', () => {
    const result = parseArgs([
      'node',
      'ralph.js',
      '--retry-story',
      'US-002',
      '--retry-story',
      'US-005',
    ]);

    assert.deepEqual(result.retryStories, ['US-002', 'US-005']);
  });

  it('parses dry-run flag', () => {
    const result = parseArgs([
      'node',
      'ralph.js',
      '--dry-run',
    ]);

    assert.equal(result.dryRun, true);
  });

  it('parses budget guardrail flags', () => {
    const result = parseArgs([
      'node',
      'ralph.js',
      '--max-total-tokens',
      '12000',
      '--max-total-cost-usd',
      '2.5',
    ]);

    assert.equal(result.maxTotalTokens, 12000);
    assert.equal(result.maxTotalCostUsd, 2.5);
  });
});

describe('run guardrails', () => {
  it('stops when the runtime budget has been exhausted', () => {
    const startedAt = new Date('2026-04-18T10:00:00.000Z');
    const now = new Date('2026-04-18T10:31:00.000Z');

    assert.equal(
      shouldStopForRuntimeBudget({ startedAt, maxRuntimeMinutes: 30, now }),
      true,
    );
  });

  it('does not stop when the runtime budget is disabled', () => {
    const startedAt = new Date('2026-04-18T10:00:00.000Z');
    const now = new Date('2026-04-18T13:00:00.000Z');

    assert.equal(
      shouldStopForRuntimeBudget({ startedAt, maxRuntimeMinutes: 0, now }),
      false,
    );
  });

  it('marks a story as skipped after repeated failures', () => {
    const state = {
      consecutiveFailures: new Map(),
      autoSkippedStories: new Set(),
    };

    const first = registerStoryFailure(state, 'US-001', 2);
    const second = registerStoryFailure(state, 'US-001', 2);

    assert.equal(first.count, 1);
    assert.equal(first.skipped, false);
    assert.equal(second.count, 2);
    assert.equal(second.skipped, true);
    assert.equal(state.autoSkippedStories.has('US-001'), true);
  });
});

describe('dry run preview', () => {
  const samplePrd = {
    userStories: [
      { id: 'US-001', title: 'First', passes: false, priority: 1 },
      { id: 'US-002', title: 'Second', passes: false, priority: 2 },
      { id: 'US-003', title: 'Done', passes: true, priority: 3 },
    ],
  };

  it('returns eligible stories in execution order', () => {
    const report = buildDryRunReport({
      prd: samplePrd,
      skipStories: [],
      persistedSkipStories: [],
    });

    assert.equal(report.status, 'ok');
    assert.deepEqual(report.eligibleStories.map((story) => story.id), ['US-001', 'US-002']);
  });

  it('marks manual and persisted skips separately', () => {
    const report = buildDryRunReport({
      prd: samplePrd,
      skipStories: ['US-001'],
      persistedSkipStories: ['US-002'],
    });

    assert.equal(report.status, 'no-eligible-stories');
    assert.deepEqual(report.skippedStories, [
      { id: 'US-001', reason: 'manual-skip' },
      { id: 'US-002', reason: 'persisted-auto-skip' },
    ]);
  });

  it('reports when the selected story is already complete', () => {
    const report = buildDryRunReport({
      prd: samplePrd,
      storyId: 'US-003',
      skipStories: [],
      persistedSkipStories: [],
    });

    assert.equal(report.status, 'already-complete');
  });

  it('reports when the selected story does not exist', () => {
    const report = buildDryRunReport({
      prd: samplePrd,
      storyId: 'US-999',
      skipStories: [],
      persistedSkipStories: [],
    });

    assert.equal(report.status, 'not-found');
  });
});
