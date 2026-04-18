import { execSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, resolve } from 'node:path';
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
