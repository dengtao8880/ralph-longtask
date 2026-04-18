import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RALPH_SCRIPT = fileURLToPath(new URL('../ralph.js', import.meta.url));

describe('ralph cli entrypoint', () => {
  it('prints help and exits successfully', () => {
    const result = spawnSync(process.execPath, [RALPH_SCRIPT, '--help'], {
      encoding: 'utf-8',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage:/);
    assert.match(result.stdout, /--version, -v/);
    assert.match(result.stdout, /ralph pipeline --help/);
  });

  it('prints version and exits successfully', () => {
    const result = spawnSync(process.execPath, [RALPH_SCRIPT, '--version'], {
      encoding: 'utf-8',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+$/);
  });
});
