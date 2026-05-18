/**
 * `graphcompose-flow approve [revisionId]` — mark a revision APPROVED.
 *
 * Any other revision currently in APPROVED status is automatically moved to
 * SUPERSEDED so the invariant "at most one APPROVED revision per project"
 * holds.
 */

import { loadProject, saveProject, touchProject } from '../projectStore.js';
import { listRevisions, loadRevision, saveRevision } from '../revisionStore.js';
import type { Revision } from '../types.js';

export async function runApprove(
  projectRoot: string,
  revisionId?: string,
): Promise<{ approved: Revision; superseded: Revision[] }> {
  const project = await loadProject(projectRoot);
  const targetId = revisionId ?? project.currentDraftRevisionId;
  if (!targetId) {
    throw new Error(
      'no revision id was given and the project has no current draft. Run new-revision or pass an explicit id.',
    );
  }
  const target = await loadRevision(projectRoot, targetId);

  // Supersede every other currently-APPROVED revision (defensive — should be
  // at most one).
  const all = await listRevisions(projectRoot);
  const superseded: Revision[] = [];
  for (const rev of all) {
    if (rev.id !== targetId && rev.status === 'APPROVED') {
      const next: Revision = { ...rev, status: 'SUPERSEDED' };
      await saveRevision(projectRoot, next);
      superseded.push(next);
    }
  }

  const approved: Revision = { ...target, status: 'APPROVED' };
  await saveRevision(projectRoot, approved);

  const updated = touchProject({
    ...project,
    currentApprovedRevisionId: targetId,
    currentDraftRevisionId:
      project.currentDraftRevisionId === targetId ? null : project.currentDraftRevisionId,
  });
  await saveProject(projectRoot, updated);
  return { approved, superseded };
}
