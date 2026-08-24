/**
 * `graphcompose-flow fail [revisionId] [--reason <text>] [--category <CATEGORY>]
 * [--stage <stage>] [--message <text>]` — mark a revision FAILED. Used when
 * compile/render/validation breaks but the revision's artifacts must be
 * preserved for forensics (plan section 10.4).
 *
 * Refuses to fail an already-APPROVED revision: that path goes through
 * undo or revert-approved, not fail.
 *
 * Every FAILED revision carries a `failure` record, because
 * schemas/revision.schema.json requires one as soon as status is FAILED.
 * `stage` says WHERE it broke and `category` says WHY, using the vocabulary
 * config/pipeline.json declares. Neither is guessed: with nothing to go on the
 * stage is written as "unspecified" rather than inventing a plausible one.
 */

import { loadProject, saveProject, touchProject } from '../projectStore.js';
import { loadRevision, saveRevision } from '../revisionStore.js';
import {
  FAILURE_CATEGORIES,
  FAILURE_STAGES,
  type FailureCategory,
  type FailureStage,
  type Revision,
  type RevisionFailure,
} from '../types.js';

/** Stage implied by a category, where the mapping is unambiguous. */
const STAGE_FOR_CATEGORY: Partial<Record<FailureCategory, FailureStage>> = {
  BUILD_FAILED: 'compile',
  RENDER_FAILED: 'render',
  ASSET_FAILED: 'asset-resolve',
  VISUAL_MISMATCH: 'visual-diff',
};

export interface FailOptions {
  /** Short note appended to userRequest and used as the failure summary. */
  reason?: string;
  /** Why the run stopped. */
  category?: string;
  /** Where it broke. Defaults from the category when that is unambiguous. */
  stage?: string;
  /** Verbatim error output from the failing stage. */
  message?: string;
}

export async function runFail(
  projectRoot: string,
  revisionId?: string,
  reason?: string,
  options: FailOptions = {},
): Promise<Revision> {
  const project = await loadProject(projectRoot);
  const targetId = revisionId ?? project.currentDraftRevisionId;
  if (!targetId) {
    throw new Error(
      'no revision id was given and the project has no current draft. Pass an explicit id.',
    );
  }
  const target = await loadRevision(projectRoot, targetId);
  if (target.status === 'APPROVED') {
    throw new Error(
      `revision ${targetId} is APPROVED. Use undo or revert-approved to roll back; fail is for compile/render breakage only.`,
    );
  }

  const summaryNote = options.reason ?? reason;
  const failure = buildFailure(summaryNote, options);

  const failed: Revision = {
    ...target,
    status: 'FAILED',
    userRequest: summaryNote
      ? `${target.userRequest}\n\nfailure: ${summaryNote}`
      : target.userRequest,
    failure,
  };
  await saveRevision(projectRoot, failed);

  const updated = touchProject({
    ...project,
    currentDraftRevisionId:
      project.currentDraftRevisionId === targetId ? null : project.currentDraftRevisionId,
  });
  await saveProject(projectRoot, updated);
  return failed;
}

function buildFailure(summaryNote: string | undefined, options: FailOptions): RevisionFailure {
  const category = normalizeCategory(options.category);
  const stage = normalizeStage(options.stage) ?? (category && STAGE_FOR_CATEGORY[category]) ?? 'unspecified';

  const failure: RevisionFailure = {
    stage,
    summary: summaryNote ?? 'marked FAILED without a stated reason',
  };
  if (category) failure.category = category;
  if (options.message) failure.message = options.message;
  return failure;
}

function normalizeCategory(value?: string): FailureCategory | undefined {
  if (!value) return undefined;
  const upper = value.toUpperCase() as FailureCategory;
  if (!FAILURE_CATEGORIES.includes(upper)) {
    throw new Error(
      `unknown failure category "${value}". Known: ${FAILURE_CATEGORIES.join(', ')}`,
    );
  }
  return upper;
}

function normalizeStage(value?: string): FailureStage | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase() as FailureStage;
  if (!FAILURE_STAGES.includes(lower)) {
    throw new Error(`unknown failure stage "${value}". Known: ${FAILURE_STAGES.join(', ')}`);
  }
  return lower;
}
