/**
 * Shared type definitions for the revision-manager CLI.
 *
 * These mirror the JSON shapes used by examples/<project>/template-project.json
 * and examples/<project>/revisions/<id>/revision.json. The CLI treats them as
 * the source of truth; it does NOT introduce a private schema.
 */

export type RevisionStatus = 'DRAFT' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';

export interface TemplateProject {
  projectName: string;
  referenceImage?: string;
  referenceDescription?: string;
  targetGraphComposeVersion: string;
  skillPack: string;
  currentApprovedRevisionId: string | null;
  currentDraftRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface RevisionArtifacts {
  // Free-form mapping; keys are well-known labels, values are filenames relative
  // to the revision folder. We do not validate the set strictly here because
  // the orchestrator (Phase 6+) may add new artifacts.
  [label: string]: string;
}

export interface Revision {
  id: string;
  parentRevisionId: string | null;
  status: RevisionStatus;
  userRequest: string;
  targetGraphComposeVersion: string;
  skillPack: string;
  changedComponents?: string[];
  createdAt: string;
  artifacts: RevisionArtifacts;
  pendingArtifacts?: string[];
}

export interface CommandOptions {
  /** Project folder containing template-project.json. Defaults to cwd. */
  project?: string;
}
