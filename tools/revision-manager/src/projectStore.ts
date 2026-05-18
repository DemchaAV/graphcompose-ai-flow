/**
 * Read/write helpers for template-project.json.
 *
 * Keeps a single shape (TemplateProject) and centralises the "missing project
 * file" error so every command produces the same actionable message.
 */

import { projectFilePath } from './paths.js';
import { readJson, writeJsonAtomic, pathExists } from './json.js';
import type { TemplateProject } from './types.js';

export class ProjectNotFoundError extends Error {
  constructor(projectRoot: string) {
    super(
      `no template-project.json found in ${projectRoot} -- run \`graphcompose-flow init <projectName>\` first`,
    );
    this.name = 'ProjectNotFoundError';
  }
}

export async function loadProject(projectRoot: string): Promise<TemplateProject> {
  const fp = projectFilePath(projectRoot);
  if (!(await pathExists(fp))) {
    throw new ProjectNotFoundError(projectRoot);
  }
  return readJson<TemplateProject>(fp);
}

export async function saveProject(projectRoot: string, project: TemplateProject): Promise<void> {
  await writeJsonAtomic(projectFilePath(projectRoot), project);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function touchProject(project: TemplateProject): TemplateProject {
  return { ...project, updatedAt: nowIso() };
}
