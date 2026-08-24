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

  it('always writes a failure record, because the schema requires one when status is FAILED', async () => {
    await runNewRevision(projectRoot, 'first');
    const failed = await runFail(projectRoot);
    // Nothing was stated, so nothing is guessed: the stage is recorded as
    // unspecified rather than inventing a plausible one.
    expect(failed.failure).toEqual({
      stage: 'unspecified',
      summary: 'marked FAILED without a stated reason',
    });
    const onDisk = await loadRevision(projectRoot, failed.id);
    expect(onDisk.failure).toBeDefined();
  });

  it('records the category and derives the stage from it', async () => {
    await runNewRevision(projectRoot, 'first');
    const failed = await runFail(projectRoot, undefined, 'javac exit 1', {
      category: 'BUILD_FAILED',
    });
    expect(failed.failure).toMatchObject({
      stage: 'compile',
      category: 'BUILD_FAILED',
      summary: 'javac exit 1',
    });
  });

  it('keeps an explicit stage over the one the category implies', async () => {
    await runNewRevision(projectRoot, 'first');
    const failed = await runFail(projectRoot, undefined, 'broke late', {
      category: 'BUILD_FAILED',
      stage: 'test',
      message: 'AssertionError: expected 2 pages',
    });
    expect(failed.failure).toMatchObject({
      stage: 'test',
      category: 'BUILD_FAILED',
      message: 'AssertionError: expected 2 pages',
    });
  });

  it('leaves the stage unspecified when the category does not imply one', async () => {
    await runNewRevision(projectRoot, 'first');
    const failed = await runFail(projectRoot, undefined, 'out of attempts', {
      category: 'ITERATION_LIMIT',
    });
    expect(failed.failure).toMatchObject({ stage: 'unspecified', category: 'ITERATION_LIMIT' });
  });

  it('rejects a category or stage outside the shared vocabulary', async () => {
    await runNewRevision(projectRoot, 'first');
    await expect(
      runFail(projectRoot, undefined, undefined, { category: 'EVERYTHING_BROKE' }),
    ).rejects.toThrow(/unknown failure category/);
    await expect(
      runFail(projectRoot, undefined, undefined, { stage: 'vibes' }),
    ).rejects.toThrow(/unknown failure stage/);
  });

  it('preserves artifacts on the failed revision', async () => {
    await runNewRevision(projectRoot, 'first');
    const before = await loadRevision(projectRoot, 'revision-001');
    const failed = await runFail(projectRoot);
    expect(failed.artifacts).toEqual(before.artifacts);
    expect(failed.pendingArtifacts).toEqual(before.pendingArtifacts);
  });
});
