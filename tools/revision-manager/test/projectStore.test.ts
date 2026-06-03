import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { makeTempDir, rmrf } from './helpers.js';
import {
  loadProject,
  saveProject,
  ProjectNotFoundError,
  nowIso,
} from '../src/projectStore.js';
import { CURRENT_SCHEMA_VERSION } from '../src/types.js';
import type { TemplateProject } from '../src/types.js';

let root: string;

beforeEach(async () => {
  root = await makeTempDir();
});

afterEach(async () => {
  await rmrf(root);
});

describe('projectStore', () => {
  it('round-trips template-project.json with 2-space indent', async () => {
    const project: TemplateProject = {
      projectName: 'sample',
      targetGraphComposeVersion: '1.6.0',
      skillPack: 'skills/versions/graphcompose-1.6',
      currentApprovedRevisionId: null,
      currentDraftRevisionId: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    await saveProject(root, project);
    const loaded = await loadProject(root);
    expect(loaded).toEqual({ ...project, schemaVersion: CURRENT_SCHEMA_VERSION });

    // Indentation check.
    const raw = await fs.readFile(path.join(root, 'template-project.json'), 'utf8');
    expect(raw.endsWith('\n')).toBe(true);
    expect(raw.split('\n').some((l) => l.startsWith('  "'))).toBe(true);
  });

  it('throws ProjectNotFoundError with an actionable message when missing', async () => {
    await expect(loadProject(root)).rejects.toBeInstanceOf(ProjectNotFoundError);
    await expect(loadProject(root)).rejects.toThrow(/run `graphcompose-flow init/);
  });
});
