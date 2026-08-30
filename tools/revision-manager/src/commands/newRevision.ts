/**
 * `graphcompose-flow new-revision "<message>" [--base <revisionId>]` — create
 * a new DRAFT revision folder.
 *
 * The new folder starts as a copy of its parent's SOURCES — template, data,
 * asset request and resolved assets, analysis and plan — so a pass edits one
 * method and renders, rather than first reassembling eight files by hand. What
 * is NOT carried is everything the parent's render and review produced:
 * output PDFs and rasters, diffs, stats, the layout snapshot, the review, the
 * evidence. Those describe the parent's render, and a child revision that
 * carried them would look measured before it had been rendered — which is the
 * exact state `iterate-status` refuses to call an iteration.
 *
 * Until v0.20.0 this command created an EMPTY folder while two documents said
 * it copied the body forward. Every real run then did the copy itself,
 * incompletely, or stayed in revision-001 and rendered there seven times.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadProject, saveProject, nowIso, touchProject } from '../projectStore.js';
import { copyRevisionBody, nextRevisionId, saveRevision } from '../revisionStore.js';
import { revisionDirPath } from '../paths.js';
import type { Revision } from '../types.js';

export interface NewRevisionOptions {
  base?: string;
  /** Do not copy the parent's sources forward (the pre-0.20 behaviour). */
  empty?: boolean;
}

/**
 * Files a render or a review writes into a revision. They are about the
 * parent's render, so they never travel to a child: a copied `visual-review.json`
 * would make the render runtime refuse the child as "already judged", and a
 * copied `visual-diff-stats.json` would make it look measured.
 */
export const RENDER_ARTIFACT_PATTERNS: readonly RegExp[] = [
  /^output[^/\\]*\.(pdf|png)$/i, // output.pdf, output.png, output-debug.*, output-page-N.png, output-overflow.*
  /^diff[^/\\]*\.png$/i, // diff.png, diff-page-N.png
  /^reference-scaled[^/\\]*\.png$/i,
  /^layout-snapshot\.json$/i,
  /^visual-diff-stats\.json$/i,
  /^region-diff-stats\.json$/i,
  /^visual-review(-classification)?\.(json|md)$/i,
  /^evidence\.json$/i,
  /^skill-validation-report\.md$/i,
  /^(render|build|test-result)\.(log|md)$/i,
  /^user-request\.md$/i, // the new revision writes its own
  /^attempts[/\\]/i, // in-revision render attempts, when a loop records them
];

export function isRenderArtifact(relativePath: string): boolean {
  const rel = relativePath.replace(/\\/g, '/');
  return RENDER_ARTIFACT_PATTERNS.some((pattern) => pattern.test(rel));
}

export interface NewRevisionResult extends Revision {
  /** Source files carried forward from the parent, relative to the revision folder. */
  copiedFiles: string[];
}

export async function runNewRevision(
  projectRoot: string,
  message: string,
  options: NewRevisionOptions = {},
): Promise<NewRevisionResult> {
  if (!message || message.trim().length === 0) {
    throw new Error('a non-empty message is required');
  }
  const project = await loadProject(projectRoot);
  const id = await nextRevisionId(projectRoot);
  const parent =
    options.base ?? project.currentDraftRevisionId ?? project.currentApprovedRevisionId ?? null;

  const dir = revisionDirPath(projectRoot, id);
  await fs.mkdir(dir, { recursive: true });

  // Sources travel; render and review artifacts do not (see the file header).
  const copiedFiles =
    parent && !options.empty
      ? await copyRevisionBody(projectRoot, parent, id, { skip: isRenderArtifact })
      : [];

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

  await fs.writeFile(path.join(dir, 'user-request.md'), buildUserRequestBody(message), 'utf8');
  await saveRevision(projectRoot, revision);

  const updated = touchProject({ ...project, currentDraftRevisionId: id });
  await saveProject(projectRoot, updated);
  return { ...revision, copiedFiles };
}

function buildUserRequestBody(message: string): string {
  const trimmed = message.trim();
  return `# User request\n\n${trimmed}\n`;
}
