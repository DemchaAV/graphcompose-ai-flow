/**
 * `graphcompose-flow reject [revisionId]` — mark a revision REJECTED.
 */

import { loadProject, saveProject, touchProject } from '../projectStore.js';
import { loadRevision, saveRevision } from '../revisionStore.js';
import type { Revision } from '../types.js';

export async function runReject(
  projectRoot: string,
  revisionId?: string,
): Promise<Revision> {
  const project = await loadProject(projectRoot);
  const targetId = revisionId ?? project.currentDraftRevisionId;
  if (!targetId) {
    throw new Error(
      'no revision id was given and the project has no current draft. Pass an explicit id.',
    );
  }
  const target = await loadRevision(projectRoot, targetId);
  const rejected: Revision = { ...target, status: 'REJECTED' };
  await saveRevision(projectRoot, rejected);

  const updated = touchProject({
    ...project,
    currentDraftRevisionId:
      project.currentDraftRevisionId === targetId ? null : project.currentDraftRevisionId,
  });
  await saveProject(projectRoot, updated);
  return rejected;
}
