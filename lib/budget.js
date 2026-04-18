function roundUsd(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function estimateTokensFromChars(chars, charsPerToken = 4) {
  if (!chars || chars <= 0) {
    return 0;
  }
  return Math.ceil(chars / charsPerToken);
}

export function estimateSessionUsage({
  promptChars = 0,
  outputChars = 0,
  charsPerToken = 4,
  inputCostPer1kTokensUsd = 0,
  outputCostPer1kTokensUsd = 0,
}) {
  const inputTokens = estimateTokensFromChars(promptChars, charsPerToken);
  const outputTokens = estimateTokensFromChars(outputChars, charsPerToken);
  const totalTokens = inputTokens + outputTokens;
  const inputCostUsd = roundUsd((inputTokens / 1000) * inputCostPer1kTokensUsd);
  const outputCostUsd = roundUsd((outputTokens / 1000) * outputCostPer1kTokensUsd);
  const totalCostUsd = roundUsd(inputCostUsd + outputCostUsd);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    inputCostUsd,
    outputCostUsd,
    totalCostUsd,
  };
}

export function accumulateUsage(currentUsage = {}, sessionUsage = {}) {
  return {
    inputTokens: (currentUsage.inputTokens || 0) + (sessionUsage.inputTokens || 0),
    outputTokens: (currentUsage.outputTokens || 0) + (sessionUsage.outputTokens || 0),
    totalTokens: (currentUsage.totalTokens || 0) + (sessionUsage.totalTokens || 0),
    inputCostUsd: roundUsd((currentUsage.inputCostUsd || 0) + (sessionUsage.inputCostUsd || 0)),
    outputCostUsd: roundUsd((currentUsage.outputCostUsd || 0) + (sessionUsage.outputCostUsd || 0)),
    totalCostUsd: roundUsd((currentUsage.totalCostUsd || 0) + (sessionUsage.totalCostUsd || 0)),
  };
}

export function shouldStopForBudget({
  usage = {},
  budget = {},
}) {
  if (budget.maxTotalTokens > 0 && (usage.totalTokens || 0) >= budget.maxTotalTokens) {
    return { stop: true, reason: 'token-budget-exhausted' };
  }

  if (budget.maxTotalCostUsd > 0 && (usage.totalCostUsd || 0) >= budget.maxTotalCostUsd) {
    return { stop: true, reason: 'cost-budget-exhausted' };
  }

  return { stop: false, reason: null };
}

export function summarizeBudgetUsage(usage = {}) {
  const totalTokens = usage.totalTokens || 0;
  const totalCostUsd = usage.totalCostUsd || 0;
  const inputTokens = usage.inputTokens || 0;
  const outputTokens = usage.outputTokens || 0;

  return `${totalTokens.toLocaleString()} tokens (~$${totalCostUsd.toFixed(2)}, input ${inputTokens.toLocaleString()}, output ${outputTokens.toLocaleString()})`;
}

export function validateBudgetConfiguration(budget = {}) {
  if (
    (budget.maxTotalCostUsd || 0) > 0 &&
    (budget.inputCostPer1kTokensUsd || 0) === 0 &&
    (budget.outputCostPer1kTokensUsd || 0) === 0
  ) {
    throw new Error('budget.maxTotalCostUsd requires inputCostPer1kTokensUsd or outputCostPer1kTokensUsd to be configured');
  }
}
