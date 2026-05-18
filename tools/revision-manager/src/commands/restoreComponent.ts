/**
 * `graphcompose-flow restore-component <name> --from <revisionId>` — selective
 * rollback (plan §11.3).
 *
 * Phase 5 implements this at the file level: the four files that describe a
 * component region (generated-template.java, architecture-plan.md,
 * layout-snapshot.json, visual-review.md) are copied wholesale from
 * <revisionId> into a new DRAFT revision built from the current draft.
 *
 * <name> must already appear in the current draft's `changedComponents` —
 * otherwise we have no evidence that the region was touched and we refuse so
 * users don't restore unrelated content.
 */

import { loadProject, saveProject, nowIso, touchProject } from '../projectStore.js';
import {
  copyRevisionBody,
  copyRevisionFile,
  loadRevision,
  nextRevisionId,
  saveRevision,
} from '../revisionStore.js';
import type { Revision } from '../types.js';

const COMPONENT_FILES: readonly string[] = [
  'generated-template.java',
  'architecture-plan.md',
  'layout-snapshot.json',
  'visual-review.md',
];

export interface RestoreComponentOptions {
  from: string;
}

export async function runRestoreComponent(
  projectRoot: string,
  componentName: string,
  options: RestoreComponentOptions,
): Promise<Revision> {
  if (!componentName) {
    throw new Error('a component name is required');
  }
  if (!options.from) {
    throw new Error('--from <revisionId> is required');
  }
  const project = await loadProject(projectRoot);
  const draftId = project.currentDraftRevisionId;
  if (!draftId) {
    throw new Error('no current draft. Run new-revision first.');
  }
  const draft = await loadRevision(projectRoot, draftId);
  const source = await loadRevision(projectRoot, options.from);

  const changed = draft.changedComponents ?? [];
  if (!changed.includes(componentName)) {
    throw new Error(
      `component "${componentName}" is not listed in the current draft's changedComponents (${changed.join(', ') || 'none'}). Refusing to restore — file-level restore needs evidence the region was touched.`,
    );
  }

  // Build a new DRAFT revision starting from the current draft, then overwrite
  // the component's files from `source`.
  const newId = await nextRevisionId(projectRoot);
  await copyRevisionBody(projectRoot, draftId, newId);
  for (const file of COMPONENT_FILES) {
    // copyRevisionFile silently no-ops if the source file is absent; that is
    // fine — a region may not include every artifact.
    await copyRevisionFile(projectRoot, source.id, newId, file);
  }

  const changedComponents = Array.from(new Set([...(draft.changedComponents ?? []), componentName]));
  const artifacts = { ...draft.artifacts, ...pickKnownArtifacts(source.artifacts) };

  const newRevision: Revision = {
    id: newId,
    parentRevisionId: draft.id,
    status: 'DRAFT',
    userRequest: `restore-component ${componentName} --from ${source.id}`,
    targetGraphComposeVersion: draft.targetGraphComposeVersion,
    skillPack: draft.skillPack,
    changedComponents,
    createdAt: nowIso(),
    artifacts,
    pendingArtifacts: draft.pendingArtifacts ? [...draft.pendingArtifacts] : undefined,
  };
  await saveRevision(projectRoot, newRevision);

  const updated = touchProject({ ...project, currentDraftRevisionId: newId });
  await saveProject(projectRoot, updated);
  return newRevision;
}

function pickKnownArtifacts(artifacts: Revision['artifacts']): Revision['artifacts'] {
  const out: Revision['artifacts'] = {};
  for (const [k, v] of Object.entries(artifacts)) {
    if (COMPONENT_FILES.includes(v)) out[k] = v;
  }
  return out;
}
