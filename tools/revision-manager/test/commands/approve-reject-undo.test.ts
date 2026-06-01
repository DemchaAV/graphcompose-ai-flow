import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { makeTempDir, rmrf } from '../helpers.js';
import { runInit } from '../../src/commands/init.js';
import { runNewRevision } from '../../src/commands/newRevision.js';
import { runApprove } from '../../src/commands/approve.js';
import { runReject } from '../../src/commands/reject.js';
import { runUndo } from '../../src/commands/undo.js';
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

describe('approve / reject / undo', () => {
  it('approve sets status and currentApprovedRevisionId', async () => {
    await runNewRevision(projectRoot, 'first');
    const result = await runApprove(projectRoot);
    expect(result.approved.status).toBe('APPROVED');
    expect(result.superseded).toHaveLength(0);
    const project = await loadProject(projectRoot);
    expect(project.currentApprovedRevisionId).toBe('revision-001');
    expect(project.currentDraftRevisionId).toBeNull();
  });

  it('approving a second revision supersedes the first', async () => {
    await runNewRevision(projectRoot, 'first');
    await runApprove(projectRoot);
    await runNewRevision(projectRoot, 'second');
    const result = await runApprove(projectRoot);
    expect(result.approved.id).toBe('revision-002');
    expect(result.superseded.map((r) => r.id)).toEqual(['revision-001']);
    const first = await loadRevision(projectRoot, 'revision-001');
    expect(first.status).toBe('SUPERSEDED');
    // Supersedure metadata MUST be written so the schema gate is happy
    // without hand-patches. Single-stamp invariant: the predecessor's
    // supersededAt equals the new revision's approvedAt.
    expect(first.supersededBy).toBe('revision-002');
    expect(typeof first.supersededAt).toBe('string');
    expect(new Date(first.supersededAt as string).toString()).not.toBe('Invalid Date');
    expect(first.supersededAt).toBe(result.approved.approvedAt);
    const project = await loadProject(projectRoot);
    expect(project.currentApprovedRevisionId).toBe('revision-002');
  });

  it('reject clears currentDraftRevisionId when matching', async () => {
    await runNewRevision(projectRoot, 'first');
    const r = await runReject(projectRoot);
    expect(r.status).toBe('REJECTED');
    const project = await loadProject(projectRoot);
    expect(project.currentDraftRevisionId).toBeNull();
  });

  it('undo creates a new revision copying the parent body', async () => {
    await runNewRevision(projectRoot, 'first');
    // Add an artifact to revision-001 so undo has something to copy.
    await fs.writeFile(
      path.join(projectRoot, 'revisions', 'revision-001', 'generated-template.java'),
      'class V1 {}\n',
      'utf8',
    );
    await runNewRevision(projectRoot, 'second');
    await fs.writeFile(
      path.join(projectRoot, 'revisions', 'revision-002', 'generated-template.java'),
      'class V2 {}\n',
      'utf8',
    );

    const undone = await runUndo(projectRoot);
    expect(undone.id).toBe('revision-003');
    expect(undone.parentRevisionId).toBe('revision-001');
    expect(undone.status).toBe('DRAFT');
    expect(undone.userRequest).toBe('undo: roll back to revision-001');

    // revision-002 must have been superseded, and revision-003 must hold
    // revision-001's body.
    const rev2 = await loadRevision(projectRoot, 'revision-002');
    expect(rev2.status).toBe('SUPERSEDED');
    const copiedBody = await fs.readFile(
      path.join(projectRoot, 'revisions', 'revision-003', 'generated-template.java'),
      'utf8',
    );
    expect(copiedBody).toBe('class V1 {}\n');

    const project = await loadProject(projectRoot);
    expect(project.currentDraftRevisionId).toBe('revision-003');
  });

  it('undo refuses when the current draft has no parent', async () => {
    await runNewRevision(projectRoot, 'first');
    await expect(runUndo(projectRoot)).rejects.toThrow(/no parent/);
  });
});
