import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { executeSession } from '../lib/executor.js';

function makeChildProcess() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.pid = 12345;
  return child;
}

describe('executor', () => {
  it('reports a missing Claude CLI cleanly when PATH lookup fails', async () => {
    const tempHome = mkdtempSync(join(tmpdir(), 'ralph-executor-missing-'));
    const originalPath = process.env.PATH;
    const originalHome = process.env.HOME;
    const originalAppData = process.env.APPDATA;
    mkdirSync(join(tempHome, '.npm-global', 'bin'), { recursive: true });
    process.env.PATH = '';
    process.env.HOME = tempHome;
    process.env.APPDATA = tempHome;

    try {
      const { findClaudeBinary } = await import(`../lib/executor.js?missing-cli-${Date.now()}`);

      assert.throws(
        () => findClaudeBinary(),
        /Claude CLI not found/,
      );
    } finally {
      process.env.PATH = originalPath;
      process.env.HOME = originalHome;
      process.env.APPDATA = originalAppData;
    }
  });

  it('captures stdout and detects the completion signal while forwarding output', async () => {
    const child = makeChildProcess();
    const forwardedStdout = new PassThrough();
    let forwardedText = '';
    forwardedStdout.on('data', (chunk) => {
      forwardedText += chunk.toString();
    });

    const resultPromise = executeSession('test prompt', {
      permissionsMode: 'full',
      claude: { maxTurns: 5 },
    }, {
      story: { id: 'US-001', title: 'Test story' },
      stdoutDestination: forwardedStdout,
      stderrDestination: new PassThrough(),
      resolveClaudeBinary: () => 'claude',
      spawnProcess: () => child,
    });

    child.stdout.write('work in progress\n');
    child.stdout.write('<promise>COMPLETE</promise>\n');
    child.emit('close', 0);

    const result = await resultPromise;

    assert.equal(result.exitCode, 0);
    assert.equal(result.error, undefined);
    assert.equal(result.completionSignaled, true);
    assert.ok(result.capturedStdout.includes('work in progress'));
    assert.ok(result.capturedStdout.includes('<promise>COMPLETE</promise>'));
    assert.ok(forwardedText.includes('work in progress'));
    assert.ok(forwardedText.includes('<promise>COMPLETE</promise>'));
  });

  it('captures output without signaling completion when the marker is absent', async () => {
    const child = makeChildProcess();

    const resultPromise = executeSession('test prompt', {
      permissionsMode: 'restricted',
      claude: { maxTurns: 3 },
    }, {
      story: { id: 'US-002', title: 'Another story' },
      stdoutDestination: new PassThrough(),
      stderrDestination: new PassThrough(),
      resolveClaudeBinary: () => 'claude',
      spawnProcess: () => child,
    });

    child.stdout.write('no completion marker here\n');
    child.stderr.write('warning on stderr\n');
    child.emit('close', 2);

    const result = await resultPromise;

    assert.equal(result.exitCode, 2);
    assert.equal(result.error, true);
    assert.equal(result.completionSignaled, false);
    assert.ok(result.capturedStdout.includes('no completion marker here'));
    assert.ok(result.capturedStderr.includes('warning on stderr'));
  });
});
