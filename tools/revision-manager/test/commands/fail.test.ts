import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { makeTempDir, rmrf } from '../helpers.js';
import { runInit } from '../../src/commands/init.js';
import { runNewRevision } from '../../src/commands/newRevision.js';
import { runApprove } from '../../src/commands/approve.js';
import { runFail } from '../../src/commands/fail.js';
import { loadProject } from '../../src/projectStore.js';
import { loadRevision } from '../../src/revisionStore.js';

let cwdBackup: string;
let root: string;
let projectRoot: string;

beforeEach(async () => {
  cwdBackup = process.cwd();
  root = await makeTempDir();
  process.chdir(root);
  await runInit('demo');
  projectRoot = path.join(root, 'demo');
});

afterEach(async () => {
  process.chdir(cwdBackup);
  await rmrf(root);
});

describe('fail', () => {
  it('marks the current draft FAILED and clears it from the project', async () => {
    await runNewRevision(projectRoot, 'first');
    const failed = await runFail(projectRoot);
    expect(failed.status).toBe('FAILED');
    const project = await loadProject(projectRoot);
    expect(project.currentDraftRevisionId).toBeNull();
  });

  it('appends the --reason note to userRequest when provided', async () => {
    await runNewRevision(projectRoot, 'compile attempt');
    const failed = await runFail(projectRoot, undefined, 'javac exit code 1');
    expect(failed.userRequest).toContain('compile attempt');
    expect(failed.userRequest).toContain('failure: javac exit code 1');
    // Loaded from disk too -- confirm it was persisted, not just returned.
    const onDisk = await loadRevision(projectRoot, failed.id);
    expect(onDisk.userRequest).toContain('failure: javac exit code 1');
  });

  it('refuses to fail an APPROVED revision', async () => {
    await runNewRevision(projectRoot, 'first');
    await runApprove(projectRoot);
    await expect(runFail(projectRoot, 'revision-001')).rejects.toThrow(/APPROVED/);
    // Status untouched.
    const onDisk = await loadRevision(projectRoot, 'revision-001');
    expect(onDisk.status).toBe('APPROVED');
  });

  it('refuses when no current draft and no explicit id', async () => {
    await expect(runFail(projectRoot)).rejects.toThrow(/no revision id/);
  });

  it('preserves artifacts on the failed revision', async () => {
    await runNewRevision(projectRoot, 'first');
    const before = await loadRevision(projectRoot, 'revision-001');
    const failed = await runFail(projectRoot);
    expect(failed.artifacts).toEqual(before.artifacts);
    expect(failed.pendingArtifacts).toEqual(before.pendingArtifacts);
  });
});
