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

  // Single timestamp for the approve transaction — the predecessor's
  // supersededAt MUST match the new revision's approvedAt so an audit
  // reads the flip as one atomic event.
  const stamp = new Date().toISOString();

  // Supersede every other currently-APPROVED revision (defensive — should be
  // at most one). Schema requires supersededAt + supersededBy on every
  // SUPERSEDED revision; without them the predecessor would fail the
  // conditional schema in schemas/revision.schema.json.
  const all = await listRevisions(projectRoot);
  const superseded: Revision[] = [];
  for (const rev of all) {
    if (rev.id !== targetId && rev.status === 'APPROVED') {
      const next: Revision = {
        ...rev,
        status: 'SUPERSEDED',
        supersededAt: stamp,
        supersededBy: targetId,
      };
      await saveRevision(projectRoot, next);
      superseded.push(next);
    }
  }

  const approved: Revision = {
    ...target,
    status: 'APPROVED',
    approvedAt: target.approvedAt ?? stamp,
  };
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
