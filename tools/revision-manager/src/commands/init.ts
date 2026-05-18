/**
 * `graphcompose-flow init <projectName>` — create a fresh template project.
 *
 * Layout produced:
 *   <projectName>/template-project.json
 *   <projectName>/reference/
 *   <projectName>/revisions/
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathExists } from '../json.js';
import { saveProject, nowIso } from '../projectStore.js';
import { projectFilePath, referenceDirPath, revisionsDirPath } from '../paths.js';
import type { TemplateProject } from '../types.js';

export interface InitOptions {
  targetGraphComposeVersion?: string;
  skillPack?: string;
}

const DEFAULT_TARGET_VERSION = '1.6.0';
const DEFAULT_SKILL_PACK = 'skills/versions/graphcompose-1.6';

export async function runInit(projectName: string, options: InitOptions = {}): Promise<string> {
  if (!projectName || projectName.trim().length === 0) {
    throw new Error('projectName is required');
  }
  const targetDir = path.resolve(process.cwd(), projectName);
  const pf = projectFilePath(targetDir);
  if (await pathExists(pf)) {
    throw new Error(
      `refusing to init: ${pf} already exists. Choose a different folder or delete the existing project.`,
    );
  }
  await fs.mkdir(targetDir, { recursive: true });
  await fs.mkdir(referenceDirPath(targetDir), { recursive: true });
  await fs.mkdir(revisionsDirPath(targetDir), { recursive: true });

  const now = nowIso();
  const project: TemplateProject = {
    projectName: path.basename(targetDir),
    referenceImage: 'reference/reference.png',
    referenceDescription: 'reference/reference.md',
    targetGraphComposeVersion: options.targetGraphComposeVersion ?? DEFAULT_TARGET_VERSION,
    skillPack: options.skillPack ?? DEFAULT_SKILL_PACK,
    currentApprovedRevisionId: null,
    currentDraftRevisionId: null,
    createdAt: now,
    updatedAt: now,
  };
  await saveProject(targetDir, project);
  return targetDir;
}
