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
  /**
   * The user's own words naming a difference ("the timeline looks wrong").
   * Written to `human-report.json` so iterate-status keeps it in front until a
   * review marks it addressed — without the model having to remember a field.
   */
  report?: string;
  /** Stable kebab-case id for the report; derived from the words when absent. */
  reportId?: string;
}

/** The file a user's report lives in, beside the revision it was made against. */
export const HUMAN_REPORT_FILE = 'human-report.json';

/** A stable id from a sentence: the first six words, kebab-cased. */
export function reportIdFrom(quote: string): string {
  const words = quote
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  const id = words.join('-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return id.length > 0 ? `reported-${id}` : `reported-${Date.now()}`;
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
  /^human-report\.json$/i, // a report is made against one revision; iterate-status carries it forward itself
  /^attempts\.json$/i, // every render-and-diff run on the parent, recorded by the harness
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
  if (options.report && options.report.trim().length > 0) {
    const report = {
      schemaVersion: 1,
      id: options.reportId ?? reportIdFrom(options.report),
      quote: options.report.trim(),
      reportedAt: nowIso(),
      addressed: false,
      $comment:
        'What the user said looks wrong, verbatim. iterate-status keeps it in front of every ' +
        'measured mismatch until a visual-review.json sets humanReportedMismatch.addressed: true ' +
        'for this id.',
    };
    await fs.writeFile(path.join(dir, HUMAN_REPORT_FILE), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  await saveRevision(projectRoot, revision);

  const updated = touchProject({ ...project, currentDraftRevisionId: id });
  await saveProject(projectRoot, updated);
  return { ...revision, copiedFiles };
}

function buildUserRequestBody(message: string): string {
  const trimmed = message.trim();
  return `# User request\n\n${trimmed}\n`;
}
