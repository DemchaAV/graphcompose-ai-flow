/**
 * Path-resolution helpers. All paths are computed with node:path so the CLI
 * works identically on Windows, macOS, and Linux.
 */

import path from 'node:path';

export const PROJECT_FILE = 'template-project.json';
export const REVISIONS_DIR = 'revisions';
export const REFERENCE_DIR = 'reference';
export const REVISION_FILE = 'revision.json';

/**
 * Resolve a project root from the command-line `--project` option.
 * Defaults to the current working directory when omitted.
 */
export function resolveProjectRoot(projectOpt?: string): string {
  return path.resolve(projectOpt ?? process.cwd());
}

export function projectFilePath(projectRoot: string): string {
  return path.join(projectRoot, PROJECT_FILE);
}

export function revisionsDirPath(projectRoot: string): string {
  return path.join(projectRoot, REVISIONS_DIR);
}

export function referenceDirPath(projectRoot: string): string {
  return path.join(projectRoot, REFERENCE_DIR);
}

export function revisionDirPath(projectRoot: string, revisionId: string): string {
  return path.join(projectRoot, REVISIONS_DIR, revisionId);
}

export function revisionFilePath(projectRoot: string, revisionId: string): string {
  return path.join(projectRoot, REVISIONS_DIR, revisionId, REVISION_FILE);
}
