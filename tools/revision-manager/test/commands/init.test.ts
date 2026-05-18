import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { makeTempDir, rmrf } from '../helpers.js';
import { runInit } from '../../src/commands/init.js';

let cwdBackup: string;
let root: string;

beforeEach(async () => {
  cwdBackup = process.cwd();
  root = await makeTempDir();
  process.chdir(root);
});

afterEach(async () => {
  process.chdir(cwdBackup);
  await rmrf(root);
});

describe('init', () => {
  it('creates template-project.json plus reference/ and revisions/', async () => {
    const dir = await runInit('demo');
    expect(dir).toBe(path.resolve(root, 'demo'));
    const projectJsonRaw = await fs.readFile(path.join(dir, 'template-project.json'), 'utf8');
    const projectJson = JSON.parse(projectJsonRaw) as Record<string, unknown>;
    expect(projectJson.projectName).toBe('demo');
    expect(projectJson.currentApprovedRevisionId).toBeNull();
    expect(projectJson.currentDraftRevisionId).toBeNull();
    await fs.access(path.join(dir, 'reference'));
    await fs.access(path.join(dir, 'revisions'));
  });

  it('refuses to overwrite an existing project', async () => {
    await runInit('demo');
    await expect(runInit('demo')).rejects.toThrow(/already exists/);
  });
});
