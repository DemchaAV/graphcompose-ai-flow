import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { makeTempDir, rmrf } from '../helpers.js';
import { runInit } from '../../src/commands/init.js';
import { runNewRevision } from '../../src/commands/newRevision.js';
import { runApprove } from '../../src/commands/approve.js';
import { runHistory, formatHistory } from '../../src/commands/history.js';

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

describe('history', () => {
  it('lists revisions in numeric order with their status', async () => {
    await runNewRevision(projectRoot, 'first');
    await runApprove(projectRoot);
    await runNewRevision(projectRoot, 'second draft request');
    const rows = await runHistory(projectRoot);
    expect(rows.map((r) => r.id)).toEqual(['revision-001', 'revision-002']);
    expect(rows[0]?.status).toBe('APPROVED');
    expect(rows[1]?.status).toBe('DRAFT');
    expect(rows[1]?.parent).toBe('revision-001');
    expect(rows[1]?.request).toBe('second draft request');
    const text = formatHistory(rows);
    expect(text).toContain('ID');
    expect(text).toContain('revision-001');
    expect(text).toContain('revision-002');
  });

  it('returns no revisions yet on an empty project', async () => {
    const rows = await runHistory(projectRoot);
    expect(rows).toHaveLength(0);
    expect(formatHistory(rows)).toBe('no revisions yet');
  });
});
