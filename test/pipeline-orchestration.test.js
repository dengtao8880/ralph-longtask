import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadConfig } from '../lib/config.js';
import { orchestratePipeline, archivePipelineLearnings } from '../lib/pipeline-cli.js';
import { savePipelineState, loadPipelineState } from '../lib/pipeline-state.js';
import {
  runSpecPhase,
  runReviewPhase,
  runConvertPhase,
  runExecutePhase,
} from '../lib/pipeline-actions.js';

function makeRalphConfig(dir, overrides = {}) {
  const config = {
    prdPath: './prd.json',
    progressPath: './progress.txt',
    ...overrides,
  };
  writeFileSync(join(dir, 'ralph.config.json'), JSON.stringify(config, null, 2), 'utf-8');
}

function makeProgressFile(dir) {
  writeFileSync(
    join(dir, 'progress.txt'),
    `# Ralph Progress Log
Started: 2026-04-18T11:00:00
---

## Codebase Patterns
- Prefer service-layer validation

## 2026-04-18T11:30:00 - US-001
- Implemented orchestration
- **Learnings for future iterations:**
  - Warning: keep phase transitions deterministic
  - Should archive learnings automatically
`,
    'utf-8',
  );
}

function makeSpecArtifacts(dir, feature = 'notifications') {
  const changeDir = join(dir, 'openspec', 'changes', feature);
  mkdirSync(join(changeDir, 'specs', feature), { recursive: true });
  writeFileSync(join(changeDir, 'proposal.md'), '# proposal', 'utf-8');
  mkdirSync(changeDir, { recursive: true });
  writeFileSync(
    join(changeDir, 'design.md'),
    `# ${feature} design

## Summary
Add ${feature} controls for users.

## Goals
- Let users manage ${feature}
`,
    'utf-8',
  );
  writeFileSync(
    join(changeDir, 'tasks.md'),
    `# Tasks

- [ ] Create data model
- [ ] Add API endpoint
- [ ] Add UI flow
`,
    'utf-8',
  );
  writeFileSync(join(changeDir, 'specs', feature, 'spec.md'), '# spec', 'utf-8');
}

function makePrdMarkdown(dir, feature = 'notifications') {
  mkdirSync(join(dir, 'tasks'), { recursive: true });
  writeFileSync(
    join(dir, 'tasks', `prd-${feature}.md`),
    `# PRD: Notifications

## Introduction

Add notifications for users.

## User Stories

### US-001: Render notifications
**Description:** As a user, I want to view notifications so that I can stay updated.

**Acceptance Criteria:**
- [ ] Notifications list renders
- [ ] Empty state is shown
`,
    'utf-8',
  );
}

describe('pipeline orchestration', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'ralph-pipeline-orchestration-'));
    makeRalphConfig(projectDir);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('advances spec and then pauses at Superpowers review when OpenSpec artifacts are already present', () => {
    makeSpecArtifacts(projectDir);
    savePipelineState(projectDir, {
      feature: 'notifications',
      completedPhases: [],
      prdPath: null,
      lastUpdated: new Date().toISOString(),
      metadata: {},
    });

    const result = orchestratePipeline(projectDir, loadConfig(projectDir), {
      execute: false,
      superpowers: { available: false, skills: [] },
    });
    const state = loadPipelineState(projectDir);

    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'review');
    assert.equal(result.reason, 'superpowers_review_required');
    assert.deepEqual(state.completedPhases, ['spec']);
    assert.equal(state.metadata.specDir, 'openspec/changes/notifications');
  });

  it('advances review and then pauses at prd.json conversion when a PRD markdown already exists', () => {
    makePrdMarkdown(projectDir, 'notifications');
    savePipelineState(projectDir, {
      feature: 'notifications',
      completedPhases: ['spec'],
      prdPath: null,
      lastUpdated: new Date().toISOString(),
      metadata: {},
    });

    const result = orchestratePipeline(projectDir, loadConfig(projectDir), {
      execute: false,
      superpowers: { available: false, skills: [] },
    });
    const state = loadPipelineState(projectDir);

    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'convert');
    assert.equal(result.reason, 'prd_json_required');
    assert.deepEqual(state.completedPhases, ['spec', 'review']);
    assert.equal(state.prdPath, 'tasks/prd-notifications.md');
  });

  it('does not auto-generate a PRD markdown during review when spec artifacts exist', () => {
    makeSpecArtifacts(projectDir);
    savePipelineState(projectDir, {
      feature: 'notifications',
      completedPhases: ['spec'],
      prdPath: null,
      lastUpdated: new Date().toISOString(),
      metadata: {
        specDir: 'openspec/changes/notifications',
      },
    });

    const result = orchestratePipeline(projectDir, loadConfig(projectDir), {
      execute: false,
      superpowers: { available: false, skills: [] },
    });
    const state = loadPipelineState(projectDir);

    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'review');
    assert.equal(result.reason, 'superpowers_review_required');
    assert.deepEqual(state.completedPhases, ['spec']);
    assert.ok(!existsSync(join(projectDir, 'tasks', 'prd-notifications.md')));
    assert.ok(!existsSync(join(projectDir, 'prd.json')));
  });

  it('pauses at spec and requests OpenSpec proposal work when artifacts are missing', () => {
    savePipelineState(projectDir, {
      feature: 'notification-center',
      completedPhases: [],
      prdPath: null,
      lastUpdated: new Date().toISOString(),
      metadata: {},
    });

    const result = orchestratePipeline(projectDir, loadConfig(projectDir), {
      execute: false,
      openSpec: { cliAvailable: true, skillsAvailable: false, changesDir: null },
      superpowers: { available: false, skills: [] },
      specOptions: {
        bootstrapOpenSpecProject: () => ({ status: 'initialized' }),
      },
    });
    const state = loadPipelineState(projectDir);

    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'spec');
    assert.equal(result.reason, 'spec_generation_required');
    assert.deepEqual(state.completedPhases, []);
    assert.equal(state.metadata.specDir, undefined);
  });

  it('records Superpowers review requirements when review skills are available', () => {
    makeSpecArtifacts(projectDir);
    savePipelineState(projectDir, {
      feature: 'notifications',
      completedPhases: ['spec'],
      prdPath: null,
      lastUpdated: new Date().toISOString(),
      metadata: {
        specDir: 'openspec/changes/notifications',
      },
    });

    const result = orchestratePipeline(projectDir, loadConfig(projectDir), {
      execute: false,
      superpowers: {
        available: true,
        skills: ['superpowers:requesting-code-review', 'superpowers:write-plan'],
      },
    });
    const state = loadPipelineState(projectDir);

    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'review');
    assert.equal(result.reason, 'superpowers_review_required');
    assert.deepEqual(result.metadata.reviewSkills, [
      'superpowers:requesting-code-review',
      'superpowers:write-plan',
    ]);
    assert.deepEqual(state.completedPhases, ['spec']);
  });

  it('keeps review blocked when only a mismatched PRD markdown exists', () => {
    makeSpecArtifacts(projectDir);
    mkdirSync(join(projectDir, 'tasks'), { recursive: true });
    writeFileSync(join(projectDir, 'tasks', 'prd-billing.md'), '# PRD: Billing', 'utf-8');
    savePipelineState(projectDir, {
      feature: 'notifications',
      completedPhases: ['spec'],
      prdPath: null,
      lastUpdated: new Date().toISOString(),
      metadata: {
        specDir: 'openspec/changes/notifications',
      },
    });

    const result = orchestratePipeline(projectDir, loadConfig(projectDir), { execute: false });
    const state = loadPipelineState(projectDir);

    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'review');
    assert.equal(result.reason, 'superpowers_review_required');
    assert.equal(state.prdPath, null);
    assert.ok(!existsSync(join(projectDir, 'tasks', 'prd-notifications.md')));
    assert.ok(!existsSync(join(projectDir, 'prd.json')));
  });

  it('auto-advances convert and stops at execute when prd.json is ready', () => {
    writeFileSync(
      join(projectDir, 'prd.json'),
      JSON.stringify({
        project: 'test-project',
        branchName: 'ralph/notifications',
        description: 'Test project',
        userStories: [
          {
            id: 'US-001',
            title: 'Small task',
            description: 'Do one thing',
            acceptanceCriteria: ['Typecheck passes'],
            priority: 1,
            passes: false,
            notes: '',
          },
        ],
      }, null, 2),
      'utf-8',
    );
    savePipelineState(projectDir, {
      feature: 'notifications',
      completedPhases: ['spec', 'review'],
      prdPath: 'tasks/prd-notifications.md',
      lastUpdated: new Date().toISOString(),
      metadata: {},
    });

    const result = orchestratePipeline(projectDir, loadConfig(projectDir), { execute: false });
    const state = loadPipelineState(projectDir);

    assert.equal(result.status, 'ready_to_execute');
    assert.equal(result.phase, 'execute');
    assert.deepEqual(state.completedPhases, ['spec', 'review', 'convert']);
    assert.equal(state.metadata.storyCount, 1);
  });

  it('blocks at convert when review PRD markdown exists but prd.json has not been produced yet', () => {
    makePrdMarkdown(projectDir);
    savePipelineState(projectDir, {
      feature: 'notifications',
      completedPhases: ['spec', 'review'],
      prdPath: 'tasks/prd-notifications.md',
      lastUpdated: new Date().toISOString(),
      metadata: {},
    });

    const result = orchestratePipeline(projectDir, loadConfig(projectDir), { execute: false });
    const state = loadPipelineState(projectDir);

    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'convert');
    assert.equal(result.reason, 'prd_json_required');
    assert.deepEqual(state.completedPhases, ['spec', 'review']);
    assert.ok(!existsSync(join(projectDir, 'prd.json')));
  });

  it('archives learnings and records the output path in pipeline metadata', () => {
    makeProgressFile(projectDir);
    savePipelineState(projectDir, {
      feature: 'notifications',
      completedPhases: ['spec', 'review', 'convert', 'execute', 'archive'],
      prdPath: 'tasks/prd-notifications.md',
      lastUpdated: new Date().toISOString(),
      metadata: {},
    });

    const result = archivePipelineLearnings(projectDir, loadConfig(projectDir));
    const state = loadPipelineState(projectDir);

    assert.equal(result.status, 'archived');
    assert.ok(result.path.endsWith('learnings.md'));
    assert.ok(existsSync(result.path));
    assert.equal(state.metadata.learningsPath, result.path);

    const content = readFileSync(result.path, 'utf-8');
    assert.ok(content.includes('# Learnings: notifications'));
    assert.ok(content.includes('## Codebase Patterns'));
  });
});

describe('pipeline phase actions', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'ralph-pipeline-actions-'));
    makeRalphConfig(projectDir);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('runSpecPhase returns advance when expected artifacts exist', () => {
    makeSpecArtifacts(projectDir);

    const result = runSpecPhase(projectDir, { feature: 'notifications' });

    assert.deepEqual(result, {
      status: 'advance',
      phase: 'spec',
      metadata: { specDir: 'openspec/changes/notifications' },
    });
  });

  it('runSpecPhase blocks when OpenSpec is unavailable', () => {
    const result = runSpecPhase(projectDir, { feature: 'notifications', prdPath: null }, {
      openSpec: { cliAvailable: false, skillsAvailable: false, changesDir: null },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'spec');
    assert.equal(result.reason, 'openspec_required');
  });

  it('runSpecPhase blocks with openspec_required when OpenSpec is unavailable and no artifacts exist', () => {
    const result = runSpecPhase(projectDir, { feature: 'notifications', prdPath: null }, {
      openSpec: { cliAvailable: false, skillsAvailable: false, changesDir: null },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'spec');
    assert.equal(result.reason, 'openspec_required');
    assert.deepEqual(result.candidates, []);
  });

  it('runSpecPhase attempts bootstrap when OpenSpec CLI is available and changes dir is missing', () => {
    const bootstrapCalls = [];
    const result = runSpecPhase(projectDir, { feature: 'notifications' }, {
      openSpec: { cliAvailable: true, skillsAvailable: false, changesDir: null },
      bootstrapOpenSpecProject: (dir) => {
        bootstrapCalls.push(dir);
        return { status: 'failed', error: 'simulated bootstrap failure' };
      },
    });

    assert.deepEqual(bootstrapCalls, [projectDir]);
    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'spec');
    assert.equal(result.reason, 'spec_generation_required');
    assert.equal(result.metadata.specBootstrap, 'failed');
    assert.equal(result.metadata.bootstrapError, 'simulated bootstrap failure');
  });

  it('runSpecPhase re-detects artifacts after bootstrap and advances when generated', () => {
    const result = runSpecPhase(projectDir, { feature: 'notifications' }, {
      openSpec: { cliAvailable: true, skillsAvailable: false, changesDir: null },
      bootstrapOpenSpecProject: (dir) => {
        const changeDir = join(dir, 'openspec', 'changes', 'notifications');
        mkdirSync(join(changeDir, 'specs', 'notifications'), { recursive: true });
        writeFileSync(join(changeDir, 'proposal.md'), '# proposal', 'utf-8');
        writeFileSync(join(changeDir, 'design.md'), '# design', 'utf-8');
        writeFileSync(join(changeDir, 'tasks.md'), '# tasks', 'utf-8');
        writeFileSync(join(changeDir, 'specs', 'notifications', 'spec.md'), '# spec', 'utf-8');
        return { status: 'initialized' };
      },
    });

    assert.deepEqual(result, {
      status: 'advance',
      phase: 'spec',
      metadata: {
        specDir: 'openspec/changes/notifications',
        specBootstrap: 'initialized',
      },
    });
  });

  it('runSpecPhase blocks with /opsx:propose guidance when only OpenSpec skills are available', () => {
    const result = runSpecPhase(projectDir, { feature: 'notification-center' }, {
      openSpec: { cliAvailable: false, skillsAvailable: true, changesDir: null },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'spec');
    assert.equal(result.reason, 'spec_generation_required');
    assert.equal(result.metadata.specBootstrap, 'skipped');
    assert.equal(result.metadata.specGeneration, 'manual-opsx-propose-required');
  });

  it('runSpecPhase blocks with /opsx:propose guidance when CLI integration is available but artifacts are still missing', () => {
    const result = runSpecPhase(projectDir, { feature: 'notification-center' }, {
      openSpec: { cliAvailable: true, skillsAvailable: false, changesDir: join(projectDir, 'openspec', 'changes') },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'spec');
    assert.equal(result.reason, 'spec_generation_required');
    assert.equal(result.metadata.specGeneration, 'opsx-propose-required');
  });

  it('runReviewPhase returns blocked when no PRD artifact exists', () => {
    const result = runReviewPhase(projectDir, { feature: 'notifications', prdPath: null });

    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'review');
    assert.equal(result.reason, 'missing_spec_artifacts');
    assert.deepEqual(result.candidates, []);
  });

  it('runReviewPhase blocks and requests Superpowers review when no PRD markdown exists', () => {
    makeSpecArtifacts(projectDir);

    const result = runReviewPhase(projectDir, {
      feature: 'notifications',
      prdPath: null,
      metadata: {
        specDir: 'openspec/changes/notifications',
      },
    }, {
      superpowers: { available: false, skills: [] },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'review');
    assert.equal(result.reason, 'superpowers_review_required');
    assert.equal(result.metadata.reviewMode, 'built-in-checklist');
    assert.ok(!existsSync(join(projectDir, 'tasks', 'prd-notifications.md')));
  });

  it('runReviewPhase exposes available Superpowers review skills when review is still pending', () => {
    makeSpecArtifacts(projectDir);

    const result = runReviewPhase(projectDir, {
      feature: 'notifications',
      prdPath: null,
      metadata: {
        specDir: 'openspec/changes/notifications',
      },
    }, {
      superpowers: { available: true, skills: ['superpowers:brainstorm'] },
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.reason, 'superpowers_review_required');
    assert.equal(result.metadata.reviewMode, 'built-in-checklist');
    assert.deepEqual(result.metadata.reviewSkills, []);
  });

  it('runReviewPhase blocks when multiple PRD candidates match ambiguously', () => {
    mkdirSync(join(projectDir, 'tasks'), { recursive: true });
    writeFileSync(join(projectDir, 'tasks', 'prd-notifications.md'), '# PRD', 'utf-8');
    writeFileSync(join(projectDir, 'tasks', 'prd-notifications-v2.md'), '# PRD', 'utf-8');

    const result = runReviewPhase(projectDir, {
      feature: 'notifications',
      prdPath: null,
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'review');
    assert.equal(result.reason, 'ambiguous');
    assert.deepEqual(result.candidates, [
      'tasks/prd-notifications.md',
      'tasks/prd-notifications-v2.md',
    ]);
  });

  it('runConvertPhase returns advance when prd.json exists and passes granularity checks', () => {
    writeFileSync(
      join(projectDir, 'prd.json'),
      JSON.stringify({
        project: 'test-project',
        branchName: 'ralph/notifications',
        description: 'Test project',
        userStories: [
          {
            id: 'US-001',
            title: 'Small task',
            description: 'Do one thing',
            acceptanceCriteria: ['Typecheck passes'],
            priority: 1,
            passes: false,
            notes: '',
          },
        ],
      }, null, 2),
      'utf-8',
    );

    const result = runConvertPhase(projectDir, loadConfig(projectDir));

    assert.deepEqual(result, {
      status: 'advance',
      phase: 'convert',
      metadata: { storyCount: 1 },
    });
  });

  it('runConvertPhase blocks with prd_json_required when PRD markdown exists but prd.json is missing', () => {
    mkdirSync(join(projectDir, 'tasks'), { recursive: true });
    writeFileSync(
      join(projectDir, 'tasks', 'prd-notifications.md'),
      `# PRD: Notifications

## Introduction

Add notifications.

## User Stories

### US-001: Render notifications
**Description:** As a user, I want notifications so that I stay updated.

**Acceptance Criteria:**
- [ ] Notifications list renders
`,
      'utf-8',
    );

    const result = runConvertPhase(projectDir, loadConfig(projectDir), {
      feature: 'notifications',
      prdPath: 'tasks/prd-notifications.md',
    });

    assert.deepEqual(result, {
      status: 'blocked',
      phase: 'convert',
      reason: 'prd_json_required',
      metadata: { prdPath: 'tasks/prd-notifications.md' },
    });
    assert.ok(!existsSync(join(projectDir, 'prd.json')));
  });

  it('runConvertPhase blocks with prd_json_required when conversion must still be done by the ralph skill', () => {
    makePrdMarkdown(projectDir);

    const result = runConvertPhase(projectDir, loadConfig(projectDir), {
      feature: 'notifications',
      prdPath: 'tasks/prd-notifications.md',
      metadata: {},
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'convert');
    assert.equal(result.reason, 'prd_json_required');
    assert.equal(result.metadata.prdPath, 'tasks/prd-notifications.md');
    assert.ok(!existsSync(join(projectDir, 'prd.json')));
  });

  it('runExecutePhase returns a normalized execute action when execution should start', () => {
    const result = runExecutePhase(projectDir, { metadata: {} }, true);

    assert.equal(result.status, 'launch');
    assert.equal(result.phase, 'execute');
    assert.equal(result.resumeExecution, false);
    assert.equal(typeof result.metadata.executionStartedAt, 'string');
  });
});

describe('pipeline orchestration OpenSpec injection', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'ralph-pipeline-open-spec-injection-'));
    makeRalphConfig(projectDir);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('uses injected OpenSpec detection in spec phase', () => {
    savePipelineState(projectDir, {
      feature: 'notifications',
      completedPhases: [],
      prdPath: null,
      lastUpdated: new Date().toISOString(),
      metadata: {},
    });

    const result = orchestratePipeline(projectDir, loadConfig(projectDir), {
      execute: false,
      openSpec: { cliAvailable: false, skillsAvailable: false, changesDir: null },
    });
    const state = loadPipelineState(projectDir);

    assert.equal(result.status, 'blocked');
    assert.equal(result.phase, 'spec');
    assert.equal(result.reason, 'openspec_required');
    assert.deepEqual(state.completedPhases, []);
  });
});
