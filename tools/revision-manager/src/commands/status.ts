/**
 * `graphcompose-flow status` — summarise the project and its newest revision.
 */

import { loadProject } from '../projectStore.js';
import { listRevisions } from '../revisionStore.js';

export interface StatusResult {
  projectName: string;
  targetGraphComposeVersion: string;
  skillPack: string;
  currentApprovedRevisionId: string;
  currentDraftRevisionId: string;
  revisionCount: number;
  latestRevisionId: string;
  latestRevisionStatus: string;
}

export async function runStatus(projectRoot: string): Promise<StatusResult> {
  const project = await loadProject(projectRoot);
  const revisions = await listRevisions(projectRoot);
  const latest = revisions.at(-1);
  return {
    projectName: project.projectName,
    targetGraphComposeVersion: project.targetGraphComposeVersion,
    skillPack: project.skillPack,
    currentApprovedRevisionId: project.currentApprovedRevisionId ?? '(none)',
    currentDraftRevisionId: project.currentDraftRevisionId ?? '(none)',
    revisionCount: revisions.length,
    latestRevisionId: latest?.id ?? '(none)',
    latestRevisionStatus: latest?.status ?? '(none)',
  };
}

export function formatStatus(s: StatusResult): string {
  const lines = [
    `project:               ${s.projectName}`,
    `targetGraphCompose:    ${s.targetGraphComposeVersion}`,
    `skillPack:             ${s.skillPack}`,
    `currentApproved:       ${s.currentApprovedRevisionId}`,
    `currentDraft:          ${s.currentDraftRevisionId}`,
    `revisionCount:         ${s.revisionCount}`,
    `latestRevision:        ${s.latestRevisionId} (${s.latestRevisionStatus})`,
  ];
  return lines.join('\n');
}
