/**
 * `graphcompose-flow revert-approved` — start a fresh DRAFT from the current
 * APPROVED revision.
 */

import { loadProject, saveProject, nowIso, touchProject } from '../projectStore.js';
import {
  copyRevisionBody,
  loadRevision,
  nextRevisionId,
  saveRevision,
} from '../revisionStore.js';
import type { Revision } from '../types.js';

export async function runRevertApproved(projectRoot: string): Promise<Revision> {
  const project = await loadProject(projectRoot);
  const approvedId = project.currentApprovedRevisionId;
  if (!approvedId) {
    throw new Error('no approved revision to revert to. Approve a revision first.');
  }
  const approved = await loadRevision(projectRoot, approvedId);

  const newId = await nextRevisionId(projectRoot);
  await copyRevisionBody(projectRoot, approvedId, newId);

  const newRevision: Revision = {
    id: newId,
    parentRevisionId: approved.id,
    status: 'DRAFT',
    userRequest: `revert-approved: restart from ${approved.id}`,
    targetGraphComposeVersion: approved.targetGraphComposeVersion,
    skillPack: approved.skillPack,
    changedComponents: approved.changedComponents ? [...approved.changedComponents] : undefined,
    createdAt: nowIso(),
    artifacts: { ...approved.artifacts },
    pendingArtifacts: approved.pendingArtifacts ? [...approved.pendingArtifacts] : undefined,
  };
  await saveRevision(projectRoot, newRevision);

  const updated = touchProject({ ...project, currentDraftRevisionId: newId });
  await saveProject(projectRoot, updated);
  return newRevision;
}
