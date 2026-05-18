/**
 * `graphcompose-flow fail [revisionId] [--reason <text>]` — mark a revision
 * FAILED. Used when compile/render/validation breaks but the revision's
 * artifacts must be preserved for forensics (plan section 10.4).
 *
 * Refuses to fail an already-APPROVED revision: that path goes through
 * undo or revert-approved, not fail.
 */

import { loadProject, saveProject, touchProject } from '../projectStore.js';
import { loadRevision, saveRevision } from '../revisionStore.js';
import type { Revision } from '../types.js';

export async function runFail(
  projectRoot: string,
  revisionId?: string,
  reason?: string,
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
  const failed: Revision = {
    ...target,
    status: 'FAILED',
    userRequest: reason
      ? `${target.userRequest}\n\nfailure: ${reason}`
      : target.userRequest,
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
