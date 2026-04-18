# Production Readiness Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `test-driven-development` for each code batch and keep changes aligned with the current strict-gate pipeline (`spec -> review -> convert -> execute -> archive`).

**Goal:** Close the highest-risk production-readiness gaps without reopening the abandoned "pipeline auto-generates everything" architecture. This round focuses on guardrails, operator control, clearer failure handling, and maintainability.

**Architecture:** Deliver the work in three batches. Batch 1 hardens Ralph CLI execution loops so one bad story cannot burn the full run budget. Batch 2 improves pipeline operator experience and removes stale dead code from the old automation-first path. Batch 3 locks the behavior in with tests and doc updates.

**Tech Stack:** Node.js 18+, ESM modules, `node:test`, Ralph CLI, OpenSpec/Superpowers strict-gate orchestration

---

## Scope And Constraints

- Preserve the current product split:
  - OpenSpec owns `spec` and `archive`
  - Superpowers owns `review`
  - `ralph` skill owns `convert`
  - Ralph CLI owns `execute`
- Do not reintroduce automatic spec generation, automatic Superpowers review synthesis, or automatic `prd.json` conversion inside `ralph pipeline`.
- Prefer deterministic guardrails over speculative automation.
- Keep CLI ergonomics simple: operator intent should be expressible with one flag, one story id, or one timeout number.
- Any skip or circuit-breaker decision must leave a readable breadcrumb in `progress.txt`.

## File Structure

**Create:**
- `D:/project/AI-Coding/ralph-longtask/docs/superpowers/plans/2026-04-18-production-readiness-guardrails.md`
- `D:/project/AI-Coding/ralph-longtask/doc/PIPELINE-SMOKE-CHECKLIST.md`

**Modify:**
- `D:/project/AI-Coding/ralph-longtask/ralph.js`
- `D:/project/AI-Coding/ralph-longtask/lib/prd.js`
- `D:/project/AI-Coding/ralph-longtask/lib/pipeline-cli.js`
- `D:/project/AI-Coding/ralph-longtask/lib/pipeline-actions.js`
- `D:/project/AI-Coding/ralph-longtask/README.md`
- `D:/project/AI-Coding/ralph-longtask/doc/USER_GUIDE.md`
- `D:/project/AI-Coding/ralph-longtask/doc/PIPELINE_GUIDE.md`
- `D:/project/AI-Coding/ralph-longtask/doc/PRODUCTION-READINESS-2026-04-18.md`
- `D:/project/AI-Coding/ralph-longtask/test/prd.test.js`
- `D:/project/AI-Coding/ralph-longtask/test/ralph-cli.test.js`
- `D:/project/AI-Coding/ralph-longtask/test/pipeline-cli.test.js`

---

## Batch 1: Mainline 1 Execution Guardrails

### Task 1: Story Selection And Skip Controls

**Files:**
- Modify: `D:/project/AI-Coding/ralph-longtask/lib/prd.js`
- Modify: `D:/project/AI-Coding/ralph-longtask/ralph.js`
- Modify: `D:/project/AI-Coding/ralph-longtask/test/prd.test.js`
- Modify: `D:/project/AI-Coding/ralph-longtask/test/ralph-cli.test.js`

- [ ] Add a story selector API that supports:
  - explicit `storyId`
  - `skipStories`
  - default priority ordering for the remaining incomplete stories
- [ ] Add CLI flags:
  - `--story US-XXX`
  - `--skip-story US-XXX` (repeatable)
- [ ] Reject invalid combinations early, such as selecting and skipping the same story.
- [ ] Keep the default behavior unchanged when no new flags are used.
- [ ] Run: `node --test test/prd.test.js test/ralph-cli.test.js`
Expected: operators can target or bypass a story without editing `prd.json` by hand.

### Task 2: Single-Story Failure Circuit Breaker

**Files:**
- Modify: `D:/project/AI-Coding/ralph-longtask/ralph.js`
- Modify: `D:/project/AI-Coding/ralph-longtask/test/ralph-cli.test.js`

- [ ] Track consecutive failures per story within one Ralph run.
- [ ] Add a CLI/config guardrail for `maxFailuresPerStory` with a safe default.
- [ ] When the threshold is reached:
  - log a readable skip message to `progress.txt`
  - exclude that story from later selection in the same run
  - continue to the next eligible story instead of burning the remaining loop budget
- [ ] If every incomplete story is tripped or skipped, stop with a clear summary instead of looping forever.
- [ ] Run: `node --test test/ralph-cli.test.js`
Expected: one bad story can no longer consume all iterations by itself.

### Task 3: Runtime Budget Guardrail

**Files:**
- Modify: `D:/project/AI-Coding/ralph-longtask/ralph.js`
- Modify: `D:/project/AI-Coding/ralph-longtask/test/ralph-cli.test.js`

- [ ] Add `--max-runtime-minutes <n>` parsing.
- [ ] Stop before starting a new iteration if the runtime budget is exhausted.
- [ ] Write a readable terminal and progress message that the run stopped due to runtime budget, not story success.
- [ ] Keep the implementation wall-clock based; do not guess token cost in this batch.
- [ ] Run: `node --test test/ralph-cli.test.js`
Expected: long unattended runs have a hard time budget.

**Batch 1 exit criteria**
- Ralph users can explicitly target stories, skip stories, and trust that a single failing story will not monopolize the run.

---

## Batch 2: Mainline 2 Operator Experience And Cleanup

### Task 4: Humanize Blocked Messaging

**Files:**
- Modify: `D:/project/AI-Coding/ralph-longtask/lib/pipeline-cli.js`
- Modify: `D:/project/AI-Coding/ralph-longtask/test/pipeline-cli.test.js`

- [ ] Replace or wrap low-level reason codes with operator-facing instructions.
- [ ] Ensure blocked messages point to the next concrete action, for example:
  - run `/opsx:explore`
  - run `/opsx:propose`
  - run Superpowers review handoff
  - run `/opsx:archive`
- [ ] Preserve machine-readable state internally; only the UX copy should change.
- [ ] Run: `node --test test/pipeline-cli.test.js`
Expected: blocked pipeline states tell the operator what to do next in plain language.

### Task 5: Remove Stale Automation-First Helpers

**Files:**
- Modify: `D:/project/AI-Coding/ralph-longtask/lib/pipeline-actions.js`

- [ ] Delete helpers that belong to the abandoned auto-generation path and are no longer reachable from the strict-gate flow.
- [ ] Keep only helpers that support detection, handoff metadata, gating, or execution handoff.
- [ ] Verify there is no doc or test still describing the removed helpers as live behavior.
- [ ] Run: `npm test`
Expected: the codebase no longer suggests two conflicting pipeline architectures.

### Task 6: Add A Realistic Pipeline Smoke Checklist

**Files:**
- Create: `D:/project/AI-Coding/ralph-longtask/doc/PIPELINE-SMOKE-CHECKLIST.md`
- Modify: `D:/project/AI-Coding/ralph-longtask/README.md`
- Modify: `D:/project/AI-Coding/ralph-longtask/doc/PIPELINE_GUIDE.md`

- [ ] Add a manual end-to-end smoke checklist that validates:
  - tool installation
  - OpenSpec artifact creation
  - Superpowers review handoff
  - `ralph` skill conversion
  - Ralph CLI execution
  - OpenSpec archive
- [ ] Keep it honest: this is a manual integration proof guide, not a fake automated E2E suite.
- [ ] Link the checklist from the main docs so maintainers can actually use it.

**Batch 2 exit criteria**
- The strict-gate pipeline is easier to operate and easier to maintain.

---

## Batch 3: Documentation And Regression Sweep

### Task 7: Align Docs With New Guardrails

**Files:**
- Modify: `D:/project/AI-Coding/ralph-longtask/README.md`
- Modify: `D:/project/AI-Coding/ralph-longtask/doc/USER_GUIDE.md`
- Modify: `D:/project/AI-Coding/ralph-longtask/doc/PIPELINE_GUIDE.md`
- Modify: `D:/project/AI-Coding/ralph-longtask/doc/PRODUCTION-READINESS-2026-04-18.md`

- [ ] Document new CLI flags and the circuit-breaker behavior.
- [ ] Clarify that skipped stories are skipped for the current run, not silently marked complete.
- [ ] Update the readiness doc to reflect what this round actually closes and what still remains open.

### Task 8: Full Regression Validation

**Files:**
- Modify tests touched above as needed

- [ ] Run focused suites while implementing.
- [ ] Run full `npm test` before closing the work.
- [ ] Record any residual production-readiness gaps that remain intentionally out of scope.

**Batch 3 exit criteria**
- Code, tests, and docs describe the same operating model.

---

## Out Of Scope For This Round

- Token-based cost ceilings
- Persistent skip lists across multiple runs
- Automatic retry scheduling
- Fully automated pipeline integration tests with real OpenSpec/Superpowers installations
- Reopening the deprecated "pipeline auto-creates artifacts" direction
