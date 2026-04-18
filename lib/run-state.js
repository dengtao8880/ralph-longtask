import { existsSync, readFileSync, writeFileSync } from 'node:fs';

function createEmptyState() {
  return { skippedStories: {} };
}

export function loadRunState(filePath) {
  if (!existsSync(filePath)) {
    return createEmptyState();
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.skippedStories !== 'object' || Array.isArray(parsed.skippedStories)) {
      return createEmptyState();
    }
    return {
      skippedStories: { ...parsed.skippedStories },
    };
  } catch {
    return createEmptyState();
  }
}

export function saveRunState(filePath, state) {
  const normalized = {
    skippedStories: { ...(state?.skippedStories || {}) },
  };
  writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf-8');
}

export function registerPersistentStorySkip(state, storyId, options = {}) {
  state.skippedStories[storyId] = {
    reason: options.reason || 'max-failures-per-story',
    failureCount: options.failureCount ?? 0,
    skippedAt: options.skippedAt || new Date().toISOString(),
  };
  return state;
}

export function clearPersistentStoryState(state, storyId) {
  delete state.skippedStories[storyId];
  return state;
}

export function applyRetryStories(state, retryStories = []) {
  for (const storyId of retryStories) {
    clearPersistentStoryState(state, storyId);
  }
  return state;
}

export function pruneCompletedStories(state, prd) {
  for (const story of prd?.userStories || []) {
    if (story.passes === true) {
      clearPersistentStoryState(state, story.id);
    }
  }
  return state;
}

export function getPersistedSkippedStories(state) {
  return Object.keys(state?.skippedStories || {});
}
