/**
 * `graphcompose-flow new-revision "<message>" [--base <revisionId>]` — create
 * a new DRAFT revision folder.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadProject, saveProject, nowIso, touchProject } from '../projectStore.js';
import { nextRevisionId, saveRevision } from '../revisionStore.js';
import { revisionDirPath } from '../paths.js';
import type { Revision } from '../types.js';

export interface NewRevisionOptions {
  base?: string;
}

export async function runNewRevision(
  projectRoot: string,
  message: string,
  options: NewRevisionOptions = {},
): Promise<Revision> {
  if (!message || message.trim().length === 0) {
    throw new Error('a non-empty message is required');
  }
  const project = await loadProject(projectRoot);
  const id = await nextRevisionId(projectRoot);
  const parent =
    options.base ?? project.currentDraftRevisionId ?? project.currentApprovedRevisionId ?? null;

  const revision: Revision = {
    id,
    parentRevisionId: parent,
    status: 'DRAFT',
    userRequest: message,
    targetGraphComposeVersion: project.targetGraphComposeVersion,
    skillPack: project.skillPack,
    createdAt: nowIso(),
    artifacts: {
      userRequest: 'user-request.md',
    },
    pendingArtifacts: ['output.pdf', 'output.png'],
  };

  const dir = revisionDirPath(projectRoot, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'user-request.md'), buildUserRequestBody(message), 'utf8');
  await saveRevision(projectRoot, revision);

  const updated = touchProject({ ...project, currentDraftRevisionId: id });
  await saveProject(projectRoot, updated);
  return revision;
}

function buildUserRequestBody(message: string): string {
  const trimmed = message.trim();
  return `# User request\n\n${trimmed}\n`;
}
