import { execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { glob } from 'glob';
import { loadPRD, validatePrdStructure } from './prd.js';
import { checkStoryGranularity, suggestSplit } from './granularity.js';

function normalizeFeatureName(feature) {
  return (feature || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function chooseCandidate(paths, feature) {
  if (paths.length === 0) {
    return { status: 'missing', path: null, candidates: [] };
  }

  const featureSlug = normalizeFeatureName(feature);
  if (featureSlug) {
    const matches = paths.filter((candidate) => candidate.toLowerCase().includes(featureSlug));
    if (matches.length === 1) {
      return { status: 'found', path: matches[0], candidates: matches };
    }
    if (matches.length === 0 && paths.length === 1) {
      return { status: 'mismatch', path: null, candidates: paths };
    }
    if (matches.length > 1) {
      return { status: 'ambiguous', path: null, candidates: matches };
    }
  }

  if (paths.length === 1) {
    return { status: 'found', path: paths[0], candidates: paths };
  }

  return { status: 'ambiguous', path: null, candidates: paths };
}

function titleCaseFeature(feature) {
  return (feature || '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toSentenceCase(text, fallback) {
  const value = (text || '').trim();
  if (!value) {
    return fallback;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function collectSectionLines(content, heading) {
  const lines = content.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.trim().toLowerCase() === heading.toLowerCase());
  if (startIndex === -1) {
    return [];
  }

  const collected = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^#{1,6}\s+/.test(line.trim())) {
      break;
    }
    collected.push(line);
  }

  return collected;
}

function collectBulletItems(content) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^- (\[[ xX]\] )?/.test(line))
    .map((line) => line.replace(/^- (\[[ xX]\] )?/, '').trim())
    .filter(Boolean);
}

function sanitizeTaskTitle(task, index, featureTitle) {
  const cleaned = (task || '')
    .replace(/[.:]+$/, '')
    .replace(/^add /i, 'Add ')
    .replace(/^create /i, 'Create ')
    .replace(/^update /i, 'Update ')
    .trim();

  if (cleaned) {
    return toSentenceCase(cleaned, `Deliver ${featureTitle} work item ${index}`);
  }

  return `Deliver ${featureTitle} work item ${index}`;
}

function createAcceptanceCriteria(task) {
  const criteria = [
    `${toSentenceCase(task, 'The implementation')} is complete`,
    'Typecheck passes',
  ];

  if (/\b(ui|screen|page|component|modal|form)\b/i.test(task || '')) {
    criteria.push('Verify in browser using dev-browser skill');
  }

  return criteria;
}

function deriveGoals(designContent, featureTitle) {
  const goalLines = collectSectionLines(designContent, '## Goals');
  const bullets = goalLines
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^- /, '').trim());

  if (bullets.length > 0) {
    return bullets;
  }

  return [
    `Ship ${featureTitle} with a scoped implementation plan`,
    `Keep ${featureTitle} work split into reviewable stories`,
  ];
}

function deriveIntroduction(designContent, featureTitle) {
  const summaryLines = collectSectionLines(designContent, '## Summary')
    .map((line) => line.trim())
    .filter(Boolean);

  if (summaryLines.length > 0) {
    return summaryLines.join(' ');
  }

  return `${featureTitle} needs a scoped implementation plan based on the available OpenSpec artifacts.`;
}

function deriveUserStories(tasksContent, featureTitle) {
  const taskItems = collectBulletItems(tasksContent).slice(0, 3);
  const items = taskItems.length > 0 ? taskItems : [
    `Prepare ${featureTitle.toLowerCase()} implementation`,
    `Deliver ${featureTitle.toLowerCase()} backend support`,
    `Deliver ${featureTitle.toLowerCase()} user flow`,
  ];

  return items.map((task, index) => ({
    id: `US-00${index + 1}`,
    title: sanitizeTaskTitle(task, index + 1, featureTitle),
    description: `As a team member, I want to ${task.toLowerCase()} so that ${featureTitle.toLowerCase()} is ready to ship.`,
    acceptanceCriteria: createAcceptanceCriteria(task),
  }));
}

function deriveFunctionalRequirements(tasksContent, featureTitle) {
  const tasks = collectBulletItems(tasksContent);
  if (tasks.length > 0) {
    return tasks.map((task, index) => `FR-${index + 1}: ${toSentenceCase(task, `Deliver ${featureTitle}`)}`);
  }

  return [
    `FR-1: The system must support the planned ${featureTitle.toLowerCase()} workflow`,
    `FR-2: The implementation must be broken into reviewable user stories`,
  ];
}

function renderProposalMarkdown(featureTitle, featureSlug, featureLabel) {
  return `## Why

Users need ${featureLabel} so they can complete the primary workflow from a single, focused experience.

## What Changes

- Add the first end-to-end ${featureLabel} workflow.
- Surface the main ${featureLabel} entry point in the product.
- Keep the first release scoped to one reviewable flow.

## Capabilities

### New Capabilities
- \`${featureSlug}\`: View and manage the primary ${featureLabel} workflow from a dedicated interface.

### Modified Capabilities
- None.

## Impact

- Application shell navigation
- ${featureTitle} data flow and state management
- Acceptance coverage for the initial ${featureLabel} workflow
`;
}

function renderSpecsMarkdown(featureTitle, featureLabel) {
  return `## ADDED Requirements

### Requirement: User can open ${featureLabel}
The system SHALL provide a dedicated ${featureLabel} entry point that opens the primary ${featureLabel} experience.

#### Scenario: Open the primary workflow
- **WHEN** the signed-in user selects the ${featureLabel} entry point
- **THEN** the system opens the ${featureLabel} workflow

### Requirement: User can review ${featureLabel} state
The system SHALL present the current ${featureLabel} information needed to complete the initial workflow.

#### Scenario: View the current state
- **WHEN** the ${featureLabel} workflow loads
- **THEN** the system shows the current ${featureLabel} data for the user

### Requirement: User can complete the initial ${featureLabel} action
The system SHALL let the user complete the core ${featureLabel} action from the same workflow.

#### Scenario: Complete the core action
- **WHEN** the user performs the primary ${featureLabel} action
- **THEN** the system saves the result and reflects the updated state in the workflow
`;
}

function renderDesignSpecMarkdown(featureTitle, featureLabel) {
  return `## Context

The project needs an initial ${featureLabel} workflow that is small enough to review and implement in one change while still covering the core user experience.

## Goals / Non-Goals

**Goals:**
- Deliver the first usable ${featureLabel} flow
- Keep ${featureLabel} scoped to one reviewable workflow
- Produce OpenSpec artifacts that can be converted into prd.json

**Non-Goals:**
- Expanding ${featureLabel} beyond the initial workflow
- Starting implementation work in the spec phase

## Decisions

- Reuse the existing product shell to expose ${featureLabel}
- Keep the first ${featureLabel} change inside the current application boundaries instead of introducing a new subsystem
- Tie the initial workflow to one user-visible path so review and validation stay focused

## Risks / Trade-offs

- [Risk] The first ${featureLabel} flow could become too broad for one review cycle -> Mitigation: keep the proposal limited to the primary workflow only
- [Risk] The initial design may miss follow-up edge cases -> Mitigation: leave secondary workflows for later changes after the first path lands
`;
}

function renderTasksSpecMarkdown(featureTitle, featureLabel) {
  return `## 1. ${featureTitle} Surface

- [ ] 1.1 Add the main ${featureLabel} entry point
- [ ] 1.2 Load the primary ${featureLabel} state for the signed-in user

## 2. ${featureTitle} Workflow

- [ ] 2.1 Render the main ${featureLabel} experience
- [ ] 2.2 Implement the core ${featureLabel} action and state update
`;
}

const SUPERPOWERS_REVIEW_SKILLS = [
  'superpowers:requesting-code-review',
  'superpowers:write-plan',
];

export function resolveReviewWorkflow(superpowers = { available: false, skills: [] }) {
  const availableSkills = new Set(superpowers.skills || []);
  const reviewSkills = SUPERPOWERS_REVIEW_SKILLS.filter((skill) => availableSkills.has(skill));
  const reviewMode = reviewSkills.length > 0 ? 'superpowers-assisted' : 'built-in-checklist';

  return {
    reviewMode,
    reviewSkills,
  };
}

function renderReviewWorkflowLines(featureTitle, reviewMode, reviewSkills) {
  const lines = ['## Review Workflow', ''];

  if (reviewMode === 'superpowers-assisted') {
    lines.push(`- Use the Superpowers review handoff before converting ${featureTitle.toLowerCase()} into prd.json`);
    if (reviewSkills.includes('superpowers:write-plan')) {
      lines.push('- Run `superpowers:write-plan` to tighten scope and acceptance criteria against the OpenSpec tasks');
    }
    if (reviewSkills.includes('superpowers:requesting-code-review')) {
      lines.push('- Run `superpowers:requesting-code-review` to catch story sizing or verification gaps before conversion');
    }
    lines.push('- Record the approved review updates in this PRD before moving to conversion');
    lines.push('- Keep implementation work in the execute phase');
    lines.push('');
    return lines;
  }

  lines.push('- Use the built-in checklist to confirm scope, story sizing, and acceptance criteria before conversion');
  lines.push('- Keep implementation work in the execute phase');
  lines.push('');
  return lines;
}

function renderPrdMarkdown({ featureTitle, designContent, tasksContent, reviewMode, reviewSkills }) {
  const goals = deriveGoals(designContent, featureTitle);
  const userStories = deriveUserStories(tasksContent, featureTitle);
  const functionalRequirements = deriveFunctionalRequirements(tasksContent, featureTitle);
  const introduction = deriveIntroduction(designContent, featureTitle);

  const lines = [
    `# PRD: ${featureTitle}`,
    '',
    '## Introduction',
    '',
    introduction,
    '',
    '## Goals',
    '',
    ...goals.map((goal) => `- ${goal}`),
    '',
    '## User Stories',
    '',
  ];

  for (const story of userStories) {
    lines.push(`### ${story.id}: ${story.title}`);
    lines.push(`**Description:** ${story.description}`);
    lines.push('');
    lines.push('**Acceptance Criteria:**');
    lines.push(...story.acceptanceCriteria.map((criterion) => `- [ ] ${criterion}`));
    lines.push('');
  }

  lines.push('## Functional Requirements');
  lines.push('');
  lines.push(...functionalRequirements.map((requirement) => `- ${requirement}`));
  lines.push('');
  lines.push(...renderReviewWorkflowLines(featureTitle, reviewMode, reviewSkills));
  lines.push('## Non-Goals');
  lines.push('');
  lines.push(`- Do not expand ${featureTitle.toLowerCase()} beyond the scoped OpenSpec change set`);
  lines.push('- Do not start implementation during the review stage');
  lines.push('');
  lines.push('## Success Metrics');
  lines.push('');
  lines.push(`- ${featureTitle} stories are clear enough to convert into prd.json without manual rewriting`);
  lines.push('- Review output preserves the scope described in OpenSpec artifacts');
  lines.push('');
  lines.push('## Open Questions');
  lines.push('');
  lines.push(`- Should ${featureTitle.toLowerCase()} require additional rollout or migration planning?`);
  lines.push(`- Review mode: ${reviewMode}`);
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function resolveSpecSource(projectDir, state) {
  const explicitSpecDir = state?.metadata?.specDir ? resolve(projectDir, state.metadata.specDir) : null;
  if (explicitSpecDir) {
    const proposalPath = join(explicitSpecDir, 'proposal.md');
    const designPath = join(explicitSpecDir, 'design.md');
    const tasksPath = join(explicitSpecDir, 'tasks.md');
    const specPaths = glob.sync('specs/**/*.md', { cwd: explicitSpecDir, absolute: true });
    const missingArtifacts = [];

    if (!existsSync(proposalPath)) {
      missingArtifacts.push('proposal.md');
    }
    if (!existsSync(designPath)) {
      missingArtifacts.push('design.md');
    }
    if (!existsSync(tasksPath)) {
      missingArtifacts.push('tasks.md');
    }
    if (specPaths.length === 0) {
      missingArtifacts.push('specs/**/*.md');
    }

    if (missingArtifacts.length === 0) {
      return {
        status: 'found',
        specDir: relative(projectDir, explicitSpecDir).replace(/\\/g, '/'),
        proposalPath,
        designPath,
        tasksPath,
        specPaths,
      };
    }

    return {
      status: 'missing_spec_artifacts',
      specDir: relative(projectDir, explicitSpecDir).replace(/\\/g, '/'),
      missingArtifacts,
      candidates: [],
    };
  }

  const detected = detectSpecArtifacts(projectDir, state?.feature);
  if (detected.status === 'found') {
    const absoluteSpecDir = join(projectDir, detected.path);
    return {
      status: 'found',
      specDir: detected.path,
      proposalPath: join(absoluteSpecDir, 'proposal.md'),
      designPath: join(absoluteSpecDir, 'design.md'),
      tasksPath: join(absoluteSpecDir, 'tasks.md'),
      specPaths: glob.sync('specs/**/*.md', { cwd: absoluteSpecDir, absolute: true }),
    };
  }

  if (detected.status === 'ambiguous') {
    return {
      status: 'ambiguous',
      candidates: detected.candidates,
    };
  }

  const featureSlug = normalizeFeatureName(state?.feature);
  const hintedSpecDir = featureSlug ? join(projectDir, 'openspec', 'changes', featureSlug) : null;
  if (hintedSpecDir && existsSync(hintedSpecDir)) {
    const missingArtifacts = [];
    if (!existsSync(join(hintedSpecDir, 'proposal.md'))) {
      missingArtifacts.push('proposal.md');
    }
    if (!existsSync(join(hintedSpecDir, 'design.md'))) {
      missingArtifacts.push('design.md');
    }
    if (!existsSync(join(hintedSpecDir, 'tasks.md'))) {
      missingArtifacts.push('tasks.md');
    }
    if (glob.sync('specs/**/*.md', { cwd: hintedSpecDir, absolute: false }).length === 0) {
      missingArtifacts.push('specs/**/*.md');
    }

    return {
      status: 'missing_spec_artifacts',
      specDir: relative(projectDir, hintedSpecDir).replace(/\\/g, '/'),
      missingArtifacts,
      candidates: [],
    };
  }

  return {
    status: 'missing_spec_artifacts',
    candidates: [],
    missingArtifacts: ['proposal.md', 'design.md', 'tasks.md', 'specs/**/*.md'],
  };
}

export function detectSpecArtifacts(projectDir, feature) {
  const candidates = glob.sync('openspec/changes/*', { cwd: projectDir, absolute: false })
    .filter((dir) =>
      existsSync(join(projectDir, dir, 'proposal.md')) &&
      existsSync(join(projectDir, dir, 'design.md')) &&
      existsSync(join(projectDir, dir, 'tasks.md')) &&
      glob.sync('specs/**/*.md', { cwd: join(projectDir, dir), absolute: false }).length > 0)
    .map((dir) => dir.replace(/\\/g, '/'));

  return chooseCandidate(candidates, feature);
}

export function detectPrdArtifacts(projectDir, state) {
  const explicitPath = state?.prdPath ? resolve(projectDir, state.prdPath) : null;
  if (explicitPath && existsSync(explicitPath)) {
    const relPath = relative(projectDir, explicitPath).replace(/\\/g, '/');
    return { status: 'found', path: relPath, candidates: [relPath] };
  }

  const candidates = glob.sync('tasks/prd-*.md', { cwd: projectDir, absolute: false })
    .map((file) => file.replace(/\\/g, '/'));

  return chooseCandidate(candidates, state?.feature);
}

function runGranularityCheck(prd) {
  const failures = [];

  for (const story of prd.userStories || []) {
    const result = checkStoryGranularity(story);
    if (!result.pass) {
      failures.push({
        story,
        violations: result.violations,
        suggestion: suggestSplit(story, result.violations),
      });
    }
  }

  return failures;
}

export function initializeOpenSpecProject(projectDir, exec = execSync) {
  try {
    exec(`openspec init --tools claude,codex "${projectDir}"`, {
      cwd: projectDir,
      stdio: 'pipe',
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, CI: '1' },
    });
    return { status: 'initialized' };
  } catch (error) {
    return { status: 'failed', error: error.message };
  }
}

function runOpenSpecCommand(projectDir, args, spawnProcess = spawnSync) {
  const result = spawnProcess('openspec', args, {
    cwd: projectDir,
    stdio: 'pipe',
    encoding: 'utf-8',
    timeout: 30000,
    env: { ...process.env, CI: '1' },
  });

  if (result.error) {
    return {
      status: 'failed',
      error: result.error.message,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      code: result.status ?? 1,
    };
  }

  if (result.status !== 0) {
    return {
      status: 'failed',
      error: (result.stderr || result.stdout || `openspec ${args.join(' ')} failed`).trim(),
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      code: result.status ?? 1,
    };
  }

  return {
    status: 'ok',
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    code: 0,
  };
}

function runOpenSpecJson(projectDir, args, spawnProcess = spawnSync) {
  const result = runOpenSpecCommand(projectDir, args, spawnProcess);
  if (result.status !== 'ok') {
    return result;
  }

  try {
    return {
      status: 'ok',
      data: JSON.parse(result.stdout),
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    return {
      status: 'failed',
      error: `Failed to parse OpenSpec JSON output for "${args.join(' ')}": ${error.message}`,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
}

function ensureOpenSpecChange(projectDir, featureSlug, spawnProcess = spawnSync) {
  const changeDir = join(projectDir, 'openspec', 'changes', featureSlug);
  if (existsSync(changeDir)) {
    return { status: 'ready', changeDir, created: false };
  }

  const created = runOpenSpecCommand(projectDir, ['new', 'change', featureSlug], spawnProcess);
  if (created.status !== 'ok') {
    return { status: 'failed', error: created.error };
  }

  return { status: 'ready', changeDir, created: true };
}

function validateOpenSpecChange(projectDir, featureSlug, spawnProcess = spawnSync) {
  const validation = runOpenSpecJson(
    projectDir,
    ['change', 'validate', featureSlug, '--json', '--no-interactive'],
    spawnProcess,
  );

  if (validation.status !== 'ok') {
    return validation;
  }

  if (validation.data?.valid === false) {
    const issueSummary = (validation.data.issues || [])
      .map((issue) => issue.message || issue.rule || JSON.stringify(issue))
      .join('; ');
    return {
      status: 'failed',
      error: issueSummary || 'OpenSpec validation reported invalid artifacts.',
      data: validation.data,
    };
  }

  return {
    status: 'validated',
    data: validation.data,
  };
}

export function generateSpecArtifacts(projectDir, state, options = {}) {
  const { spawnProcess = spawnSync } = options;
  const featureSlug = normalizeFeatureName(state?.feature) || 'feature';
  const featureTitle = titleCaseFeature(state?.feature) || 'Feature';
  const featureLabel = featureTitle.toLowerCase();
  const specDir = join(projectDir, 'openspec', 'changes', featureSlug);
  const change = ensureOpenSpecChange(projectDir, featureSlug, spawnProcess);

  if (change.status !== 'ready') {
    return {
      status: 'failed',
      error: change.error,
    };
  }

  const statusReport = runOpenSpecJson(projectDir, ['status', '--change', featureSlug, '--json'], spawnProcess);
  if (statusReport.status !== 'ok') {
    return {
      status: 'failed',
      error: statusReport.error,
    };
  }

  if (statusReport.data?.schemaName && statusReport.data.schemaName !== 'spec-driven') {
    return {
      status: 'failed',
      error: `Unsupported OpenSpec schema "${statusReport.data.schemaName}" for automatic proposal generation.`,
    };
  }

  const proposalInstructions = runOpenSpecJson(
    projectDir,
    ['instructions', 'proposal', '--change', featureSlug, '--json'],
    spawnProcess,
  );
  const designInstructions = runOpenSpecJson(
    projectDir,
    ['instructions', 'design', '--change', featureSlug, '--json'],
    spawnProcess,
  );
  const specsInstructions = runOpenSpecJson(
    projectDir,
    ['instructions', 'specs', '--change', featureSlug, '--json'],
    spawnProcess,
  );
  const tasksInstructions = runOpenSpecJson(
    projectDir,
    ['instructions', 'tasks', '--change', featureSlug, '--json'],
    spawnProcess,
  );

  for (const instruction of [proposalInstructions, designInstructions, specsInstructions, tasksInstructions]) {
    if (instruction.status !== 'ok') {
      return {
        status: 'failed',
        error: instruction.error,
      };
    }
  }

  const proposalPath = join(specDir, proposalInstructions.data.outputPath || 'proposal.md');
  const designPath = join(specDir, designInstructions.data.outputPath || 'design.md');
  const tasksPath = join(specDir, tasksInstructions.data.outputPath || 'tasks.md');
  const specPath = join(
    specDir,
    'specs',
    featureSlug,
    'spec.md',
  );

  try {
    mkdirSync(specDir, { recursive: true });
    mkdirSync(dirname(specPath), { recursive: true });

    if (!existsSync(proposalPath)) {
      writeFileSync(proposalPath, renderProposalMarkdown(featureTitle, featureSlug, featureLabel), 'utf-8');
    }

    if (!existsSync(specPath)) {
      writeFileSync(specPath, renderSpecsMarkdown(featureTitle, featureLabel), 'utf-8');
    }

    if (!existsSync(designPath)) {
      writeFileSync(designPath, renderDesignSpecMarkdown(featureTitle, featureLabel), 'utf-8');
    }

    if (!existsSync(tasksPath)) {
      writeFileSync(tasksPath, renderTasksSpecMarkdown(featureTitle, featureLabel), 'utf-8');
    }

    const validation = validateOpenSpecChange(projectDir, featureSlug, spawnProcess);
    if (validation.status !== 'validated') {
      return {
        status: 'failed',
        error: validation.error,
      };
    }

    return {
      status: 'generated',
      path: relative(projectDir, specDir).replace(/\\/g, '/'),
      proposalPath: relative(projectDir, proposalPath).replace(/\\/g, '/'),
      specPaths: [relative(projectDir, specPath).replace(/\\/g, '/')],
      specGeneration: 'openspec-proposal',
    };
  } catch (error) {
    return {
      status: 'failed',
      error: error.message,
    };
  }
}

export function runSpecPhase(projectDir, state, options = {}) {
  const {
    openSpec = { cliAvailable: false, skillsAvailable: false, changesDir: null },
    bootstrapOpenSpecProject = initializeOpenSpecProject,
  } = options;

  const spec = detectSpecArtifacts(projectDir, state.feature);
  if (spec.status === 'found') {
    return { status: 'advance', phase: 'spec', metadata: { specDir: spec.path } };
  }

  if (spec.status === 'ambiguous') {
    return { status: 'blocked', phase: 'spec', reason: 'ambiguous', candidates: spec.candidates };
  }

  const openSpecAvailable = Boolean(openSpec.cliAvailable || openSpec.skillsAvailable);
  if (!openSpecAvailable) {
    return {
      status: 'blocked',
      phase: 'spec',
      reason: 'openspec_required',
      candidates: [],
    };
  }

  let bootstrap = { status: 'skipped' };
  if (openSpec.cliAvailable && !openSpec.changesDir) {
    bootstrap = bootstrapOpenSpecProject(projectDir);
    if (bootstrap.status === 'failed') {
      return {
        status: 'blocked',
        phase: 'spec',
        reason: 'spec_generation_required',
        candidates: spec.candidates,
        metadata: {
          specBootstrap: bootstrap.status,
          bootstrapError: bootstrap.error,
          specGeneration: 'openspec-init-failed',
        },
      };
    }

    const refreshedSpec = detectSpecArtifacts(projectDir, state.feature);
    if (refreshedSpec.status === 'found') {
      return {
        status: 'advance',
        phase: 'spec',
        metadata: {
          specDir: refreshedSpec.path,
          specBootstrap: bootstrap.status,
        },
      };
    }
  }

  return {
    status: 'blocked',
    phase: 'spec',
    reason: 'spec_generation_required',
    candidates: spec.candidates,
    metadata: {
      specBootstrap: bootstrap.status,
      bootstrapError: bootstrap.error,
      specGeneration: openSpec.cliAvailable ? 'opsx-propose-required' : 'manual-opsx-propose-required',
    },
  };
}

export function generatePrdFromSpec(projectDir, state, options = {}) {
  const {
    specSource = resolveSpecSource(projectDir, state),
    superpowers = { available: false, skills: [] },
  } = options;

  if (specSource.status !== 'found') {
    return {
      status: 'failed',
      error: `Spec source unavailable: ${specSource.status}`,
    };
  }

  try {
    const featureSlug = normalizeFeatureName(state?.feature) || 'feature';
    const featureTitle = titleCaseFeature(state?.feature) || 'Feature';
    const designContent = readFileSync(specSource.designPath, 'utf-8');
    const tasksContent = readFileSync(specSource.tasksPath, 'utf-8');
    const { reviewMode, reviewSkills } = resolveReviewWorkflow(superpowers);
    const prdPath = join(projectDir, 'tasks', `prd-${featureSlug}.md`);

    mkdirSync(join(projectDir, 'tasks'), { recursive: true });
    writeFileSync(
      prdPath,
      renderPrdMarkdown({ featureTitle, designContent, tasksContent, reviewMode, reviewSkills }),
      'utf-8',
    );

    return {
      status: 'generated',
      path: relative(projectDir, prdPath).replace(/\\/g, '/'),
      reviewMode,
      reviewSkills,
      specDir: specSource.specDir,
    };
  } catch (error) {
    return {
      status: 'failed',
      error: error.message,
    };
  }
}

export function runReviewPhase(projectDir, state, options = {}) {
  const {
    superpowers = { available: false, skills: [] },
  } = options;

  const prdDoc = detectPrdArtifacts(projectDir, state);
  if (prdDoc.status === 'found') {
    return { status: 'advance', phase: 'review', metadata: { prdPath: prdDoc.path } };
  }

  if (prdDoc.status === 'ambiguous') {
    return { status: 'blocked', phase: 'review', reason: 'ambiguous', candidates: prdDoc.candidates };
  }

  const specSource = resolveSpecSource(projectDir, state);
  if (specSource.status !== 'found') {
    return {
      status: 'blocked',
      phase: 'review',
      reason: specSource.status,
      candidates: specSource.candidates || [],
      metadata: {
        specDir: specSource.specDir,
        missingArtifacts: specSource.missingArtifacts,
      },
    };
  }

  return {
    status: 'blocked',
    phase: 'review',
    reason: 'superpowers_review_required',
    metadata: {
      specDir: specSource.specDir,
      proposalPath: specSource.proposalPath ? relative(projectDir, specSource.proposalPath).replace(/\\/g, '/') : null,
      designPath: specSource.designPath ? relative(projectDir, specSource.designPath).replace(/\\/g, '/') : null,
      tasksPath: specSource.tasksPath ? relative(projectDir, specSource.tasksPath).replace(/\\/g, '/') : null,
      specPaths: (specSource.specPaths || []).map((path) => relative(projectDir, path).replace(/\\/g, '/')),
      superpowersAvailable: superpowers.available,
      reviewMode: resolveReviewWorkflow(superpowers).reviewMode,
      reviewSkills: resolveReviewWorkflow(superpowers).reviewSkills,
    },
  };
}

export function runConvertPhase(projectDir, config, state = {}, options = {}) {
  if (!existsSync(config.prdPath)) {
    const prdDoc = detectPrdArtifacts(projectDir, state);
    if (prdDoc.status !== 'found') {
      return { status: 'blocked', phase: 'convert', reason: 'missing_prd_json', candidates: prdDoc.candidates || [] };
    }

    return {
      status: 'blocked',
      phase: 'convert',
      reason: 'prd_json_required',
      metadata: {
        prdPath: prdDoc.path,
      },
    };
  }

  const prd = loadPRD(config.prdPath);
  const structure = validatePrdStructure(prd);
  if (!structure.valid) {
    return {
      status: 'blocked',
      phase: 'convert',
      reason: 'invalid_prd_structure',
      metadata: structure,
    };
  }

  const failures = runGranularityCheck(prd);
  if (failures.length > 0) {
    return { status: 'blocked', phase: 'convert', reason: 'granularity_failed', failures };
  }

  return {
    status: 'advance',
    phase: 'convert',
    metadata: { storyCount: (prd.userStories || []).length },
  };
}

export function runExecutePhase(projectDir, state, execute) {
  if (!execute) {
    return { status: 'ready_to_execute', phase: 'execute' };
  }

  return {
    status: 'launch',
    phase: 'execute',
    metadata: {
      executionStartedAt: state.metadata?.executionStartedAt || new Date().toISOString(),
    },
    resumeExecution: Boolean(state.metadata?.executionStartedAt),
  };
}

export function archiveOpenSpecChange(projectDir, feature, spawnProcess = spawnSync) {
  const featureSlug = normalizeFeatureName(feature) || feature;
  const archived = runOpenSpecCommand(projectDir, ['archive', featureSlug, '-y'], spawnProcess);
  if (archived.status !== 'ok') {
    return {
      status: 'failed',
      error: archived.error,
    };
  }

  return {
    status: 'archived',
  };
}

export function runArchivePhase(projectDir, state, options = {}) {
  const {
    openSpec = { cliAvailable: false, skillsAvailable: false, changesDir: null },
    archiveChange = archiveOpenSpecChange,
  } = options;

  if (!openSpec.cliAvailable) {
    return {
      status: 'blocked',
      phase: 'archive',
      reason: 'archive_required',
      metadata: {
        archiveMode: openSpec.skillsAvailable ? 'manual-opsx-archive-required' : 'openspec-cli-required',
      },
    };
  }

  const archived = archiveChange(projectDir, state.feature);
  if (archived.status !== 'archived') {
    return {
      status: 'blocked',
      phase: 'archive',
      reason: 'archive_failed',
      metadata: {
        archiveError: archived.error,
      },
    };
  }

  return {
    status: 'advance',
    phase: 'archive',
    metadata: {
      archivedAt: new Date().toISOString(),
      archiveMode: 'openspec-cli',
    },
  };
}

export function launchRalph(projectDir, resume) {
  const scriptPath = fileURLToPath(new URL('../ralph.js', import.meta.url));
  const args = [scriptPath, '--config', projectDir];
  if (resume) {
    args.push('--resume');
  }

  return spawnSync(process.execPath, args, {
    cwd: projectDir,
    stdio: 'inherit',
  });
}
