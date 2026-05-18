/**
 * `graphcompose-flow undo` — roll the current draft back to its parent.
 *
 * Creates a NEW revision whose body is a literal copy of the parent's
 * artifacts. The current draft is marked SUPERSEDED. We never delete history;
 * the rejected attempt remains on disk and in the audit trail.
 */

import { loadProject, saveProject, nowIso, touchProject } from '../projectStore.js';
import {
  copyRevisionBody,
  loadRevision,
  nextRevisionId,
  saveRevision,
} from '../revisionStore.js';
import type { Revision } from '../types.js';

export async function runUndo(projectRoot: string): Promise<Revision> {
  const project = await loadProject(projectRoot);
  const draftId = project.currentDraftRevisionId;
  if (!draftId) {
    throw new Error('no current draft to undo. Run new-revision first.');
  }
  const draft = await loadRevision(projectRoot, draftId);
  const parentId = draft.parentRevisionId;
  if (!parentId) {
    throw new Error(
      `current draft ${draft.id} has no parent — nothing to undo to. Use reject instead.`,
    );
  }
  const parent = await loadRevision(projectRoot, parentId);

  // Mark the existing draft as superseded — the audit trail keeps it.
  const supersededDraft: Revision = { ...draft, status: 'SUPERSEDED' };
  await saveRevision(projectRoot, supersededDraft);

  // Create the new revision: literal copy of parent body, fresh metadata.
  const newId = await nextRevisionId(projectRoot);
  const copied = await copyRevisionBody(projectRoot, parentId, newId);

  const newRevision: Revision = {
    id: newId,
    parentRevisionId: parent.id,
    status: 'DRAFT',
    userRequest: `undo: roll back to ${parent.id}`,
    targetGraphComposeVersion: parent.targetGraphComposeVersion,
    skillPack: parent.skillPack,
    changedComponents: parent.changedComponents ? [...parent.changedComponents] : undefined,
    createdAt: nowIso(),
    // Preserve the parent's artifact map (we copied the same files).
    artifacts: { ...parent.artifacts },
    pendingArtifacts: parent.pendingArtifacts ? [...parent.pendingArtifacts] : undefined,
  };
  await saveRevision(projectRoot, newRevision);

  // Suppress unused-variable lint while making the count visible to tests.
  void copied;

  const updated = touchProject({ ...project, currentDraftRevisionId: newId });
  await saveProject(projectRoot, updated);
  return newRevision;
}
