import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { makeTempDir, rmrf } from '../helpers.js';
import { runInit } from '../../src/commands/init.js';
import { runNewRevision } from '../../src/commands/newRevision.js';
import { loadProject } from '../../src/projectStore.js';

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

describe('new-revision', () => {
  it('creates revision-001 on a fresh project with no parent', async () => {
    const rev = await runNewRevision(projectRoot, 'first draft');
    expect(rev.id).toBe('revision-001');
    expect(rev.parentRevisionId).toBeNull();
    expect(rev.status).toBe('DRAFT');
    expect(rev.userRequest).toBe('first draft');
    const userReq = await fs.readFile(
      path.join(projectRoot, 'revisions', 'revision-001', 'user-request.md'),
      'utf8',
    );
    expect(userReq).toContain('first draft');
    const project = await loadProject(projectRoot);
    expect(project.currentDraftRevisionId).toBe('revision-001');
  });

  it('uses currentDraft as the parent for revision-002', async () => {
    await runNewRevision(projectRoot, 'first');
    const rev2 = await runNewRevision(projectRoot, 'second');
    expect(rev2.id).toBe('revision-002');
    expect(rev2.parentRevisionId).toBe('revision-001');
    const project = await loadProject(projectRoot);
    expect(project.currentDraftRevisionId).toBe('revision-002');
  });

  it('honours --base when provided', async () => {
    await runNewRevision(projectRoot, 'first');
    await runNewRevision(projectRoot, 'second');
    const rev3 = await runNewRevision(projectRoot, 'third', { base: 'revision-001' });
    expect(rev3.parentRevisionId).toBe('revision-001');
  });
});
