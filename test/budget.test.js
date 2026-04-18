import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTokensFromChars,
  estimateSessionUsage,
  shouldStopForBudget,
  summarizeBudgetUsage,
  validateBudgetConfiguration,
} from '../lib/budget.js';

describe('budget', () => {
  it('estimates tokens from chars with ceiling rounding', () => {
    assert.equal(estimateTokensFromChars(0, 4), 0);
    assert.equal(estimateTokensFromChars(1, 4), 1);
    assert.equal(estimateTokensFromChars(8, 4), 2);
    assert.equal(estimateTokensFromChars(9, 4), 3);
  });

  it('estimates session usage from prompt and output chars', () => {
    const usage = estimateSessionUsage({
      promptChars: 800,
      outputChars: 400,
      charsPerToken: 4,
      inputCostPer1kTokensUsd: 0.003,
      outputCostPer1kTokensUsd: 0.015,
    });

    assert.equal(usage.inputTokens, 200);
    assert.equal(usage.outputTokens, 100);
    assert.equal(usage.totalTokens, 300);
    assert.equal(usage.inputCostUsd, 0.0006);
    assert.equal(usage.outputCostUsd, 0.0015);
    assert.equal(usage.totalCostUsd, 0.0021);
  });

  it('stops when the token budget is exhausted', () => {
    const result = shouldStopForBudget({
      usage: { totalTokens: 1200, totalCostUsd: 0 },
      budget: { maxTotalTokens: 1000, maxTotalCostUsd: 0 },
    });

    assert.equal(result.stop, true);
    assert.equal(result.reason, 'token-budget-exhausted');
  });

  it('stops when the cost budget is exhausted', () => {
    const result = shouldStopForBudget({
      usage: { totalTokens: 0, totalCostUsd: 2.51 },
      budget: { maxTotalTokens: 0, maxTotalCostUsd: 2.5 },
    });

    assert.equal(result.stop, true);
    assert.equal(result.reason, 'cost-budget-exhausted');
  });

  it('does not stop when no budget is configured', () => {
    const result = shouldStopForBudget({
      usage: { totalTokens: 5000, totalCostUsd: 10 },
      budget: { maxTotalTokens: 0, maxTotalCostUsd: 0 },
    });

    assert.equal(result.stop, false);
  });

  it('formats a readable usage summary', () => {
    const summary = summarizeBudgetUsage({
      totalTokens: 1532,
      totalCostUsd: 1.2345,
      inputTokens: 1000,
      outputTokens: 532,
    });

    assert.match(summary, /1,532 tokens/i);
    assert.match(summary, /\$1\.23/);
    assert.match(summary, /input 1,000/i);
    assert.match(summary, /output 532/i);
  });

  it('requires token pricing when a cost budget is configured', () => {
    assert.throws(
      () => validateBudgetConfiguration({
        maxTotalCostUsd: 2.5,
        inputCostPer1kTokensUsd: 0,
        outputCostPer1kTokensUsd: 0,
      }),
      /requires inputCostPer1kTokensUsd or outputCostPer1kTokensUsd/i,
    );
  });
});
