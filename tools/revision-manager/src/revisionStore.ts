/**
 * Read/write helpers for revision.json and revision folders.
 *
 * Provides:
 *   - nextRevisionId(): scans the revisions folder and returns the next
 *     zero-padded id (revision-001, revision-002, ...). Gaps in the sequence
 *     do NOT renumber — the next id is always strictly greater than the
 *     current maximum.
 *   - listRevisions(): returns every revision sorted by id ascending.
 *   - copyRevisionBody(): copies every file in a revision folder (except
 *     revision.json) into another revision folder.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  revisionDirPath,
  revisionFilePath,
  revisionsDirPath,
} from './paths.js';
import { readJson, writeJsonAtomic, pathExists } from './json.js';
import { CURRENT_SCHEMA_VERSION } from './types.js';
import type { Revision } from './types.js';

const REVISION_ID_RE = /^revision-(\d{3,})$/;

export class RevisionNotFoundError extends Error {
  constructor(projectRoot: string, revisionId: string) {
    super(`revision ${revisionId} not found under ${revisionsDirPath(projectRoot)}`);
    this.name = 'RevisionNotFoundError';
  }
}

/**
 * Read every revision under <project>/revisions/<id>/revision.json.
 * Returned array is sorted ascending by numeric suffix.
 */
export async function listRevisions(projectRoot: string): Promise<Revision[]> {
  const dir = revisionsDirPath(projectRoot);
  if (!(await pathExists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const ids = entries
    .filter((e) => e.isDirectory() && REVISION_ID_RE.test(e.name))
    .map((e) => e.name)
    .sort(compareRevisionIds);
  const out: Revision[] = [];
  for (const id of ids) {
    const fp = revisionFilePath(projectRoot, id);
    if (await pathExists(fp)) {
      out.push(await readJson<Revision>(fp));
    }
  }
  return out;
}

export async function loadRevision(projectRoot: string, revisionId: string): Promise<Revision> {
  const fp = revisionFilePath(projectRoot, revisionId);
  if (!(await pathExists(fp))) {
    throw new RevisionNotFoundError(projectRoot, revisionId);
  }
  return readJson<Revision>(fp);
}

/**
 * Artifact labels an agent reached for instead of the canonical one.
 *
 * Nothing writes the artifact map: the workflow leaves the labelling to whoever
 * is driving it, and two acceptance runs of the same harness produced two
 * vocabularies for the same seven files — `generatedTemplate` in one,
 * `template` in the other. Both are perfectly readable and neither satisfies
 * `revision.schema.json`, which requires the canonical names; the resulting
 * error says "missing property template" with `generatedTemplate` sitting two
 * lines above it.
 *
 * Renaming is the deterministic half of that problem, so it is done here rather
 * than asked for in a skill. What is NOT done here is inventing a missing
 * artifact: a label absent under every name is a real gap and stays reported.
 */
const ARTIFACT_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  generatedTemplate: 'template',
  generatedTest: 'test',
  templateFile: 'template',
  testFile: 'test',
  outputPdf: 'pdf',
  outputPreview: 'preview',
  dataFile: 'data',
  dataJson: 'data',
  skillValidationReport: 'skillValidation',
});

/** Rewrite known aliases to the canonical label, keeping anything already canonical. */
export function canonicaliseArtifacts(
  artifacts: Revision['artifacts'],
): Revision['artifacts'] {
  const out: Revision['artifacts'] = {};
  for (const [label, file] of Object.entries(artifacts ?? {})) {
    const canonical = ARTIFACT_ALIASES[label] ?? label;
    // An explicit canonical entry wins over an alias for the same slot, so a
    // manifest carrying both does not depend on key order.
    if (canonical !== label && Object.prototype.hasOwnProperty.call(artifacts, canonical)) continue;
    out[canonical] = file;
  }
  return out;
}

export async function saveRevision(projectRoot: string, revision: Revision): Promise<void> {
  const stamped: Revision = {
    ...revision,
    schemaVersion: revision.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    artifacts: canonicaliseArtifacts(revision.artifacts),
  };
  await writeJsonAtomic(revisionFilePath(projectRoot, revision.id), stamped);
}

/**
 * Compute the next revision id. We look at the highest numeric suffix present
 * in the folder and return that + 1, zero-padded to at least three digits.
 *
 * This deliberately ignores gaps: if you have revision-001 and revision-003,
 * the next id is revision-004 (NOT revision-002).
 */
export async function nextRevisionId(projectRoot: string): Promise<string> {
  const dir = revisionsDirPath(projectRoot);
  if (!(await pathExists(dir))) return 'revision-001';
  const entries = await fs.readdir(dir, { withFileTypes: true });
  let max = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const m = REVISION_ID_RE.exec(entry.name);
    if (!m || m[1] === undefined) continue;
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return formatRevisionId(max + 1);
}

export function formatRevisionId(n: number): string {
  return `revision-${String(n).padStart(3, '0')}`;
}

export function compareRevisionIds(a: string, b: string): number {
  const na = revisionNumber(a);
  const nb = revisionNumber(b);
  return na - nb;
}

function revisionNumber(id: string): number {
  const m = REVISION_ID_RE.exec(id);
  if (!m || m[1] === undefined) return Number.MAX_SAFE_INTEGER;
  return Number.parseInt(m[1], 10);
}

/**
 * Copy every file under <src>/ into <dest>/, excluding revision.json (which is
 * always written separately by the caller). Sub-directories are copied
 * recursively. Existing files in <dest> are overwritten.
 */
export async function copyRevisionBody(
  projectRoot: string,
  fromId: string,
  toId: string,
  options: { exclude?: string[]; skip?: (relativePath: string) => boolean } = {},
): Promise<string[]> {
  const exclude = new Set([...(options.exclude ?? []), 'revision.json']);
  const skip = options.skip ?? (() => false);
  const fromDir = revisionDirPath(projectRoot, fromId);
  const toDir = revisionDirPath(projectRoot, toId);
  await fs.mkdir(toDir, { recursive: true });
  const copied: string[] = [];
  await copyTree(fromDir, toDir, exclude, skip, '', copied);
  return copied;
}

async function copyTree(
  fromDir: string,
  toDir: string,
  exclude: Set<string>,
  skip: (relativePath: string) => boolean,
  relPrefix: string,
  copied: string[],
): Promise<void> {
  if (!(await pathExists(fromDir))) return;
  const entries = await fs.readdir(fromDir, { withFileTypes: true });
  for (const entry of entries) {
    const rel = relPrefix ? path.join(relPrefix, entry.name) : entry.name;
    if (exclude.has(rel) || skip(rel)) continue;
    const src = path.join(fromDir, entry.name);
    const dst = path.join(toDir, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(dst, { recursive: true });
      await copyTree(src, dst, exclude, skip, rel, copied);
    } else if (entry.isFile()) {
      await fs.copyFile(src, dst);
      copied.push(rel);
    }
  }
}

/**
 * Copy a single named file from one revision folder to another, overwriting
 * the destination. Returns true if the source file existed and was copied.
 */
export async function copyRevisionFile(
  projectRoot: string,
  fromId: string,
  toId: string,
  filename: string,
): Promise<boolean> {
  const src = path.join(revisionDirPath(projectRoot, fromId), filename);
  if (!(await pathExists(src))) return false;
  const dst = path.join(revisionDirPath(projectRoot, toId), filename);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);
  return true;
}
