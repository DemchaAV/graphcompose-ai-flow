/**
 * Shared type definitions for the revision-manager CLI.
 *
 * These mirror the JSON shapes used by examples/<project>/template-project.json
 * and examples/<project>/revisions/<id>/revision.json. The CLI treats them as
 * the source of truth; it does NOT introduce a private schema.
 */

export type RevisionStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUPERSEDED'
  | 'FAILED'
  | 'REVERTED';

export const REVISION_STATUSES: readonly RevisionStatus[] = [
  'DRAFT',
  'APPROVED',
  'REJECTED',
  'SUPERSEDED',
  'FAILED',
  'REVERTED',
] as const;

/**
 * On-disk artifact contract version, stamped onto every template-project.json
 * and revision.json the CLI writes. Absent on pre-versioning files, which are
 * treated as version 1 ("no field = v1"). Bump this — and add a migration step
 * in projectStore / revisionStore — only when the on-disk shape changes.
 */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Render block consumed by scripts/lib/render-runtime.mjs. Only `templateClass`
 * is required; every other field has a safe default in the runtime. Modelled
 * here because the on-disk template-project.json already carries it (e.g.
 * examples/invoice-reference) and `init --template` writes it.
 */
export interface RenderConfig {
  templateClass: string;
  specProviderClass?: string | null;
  dataFileName?: string | null;
  pages?: number;
  runnerPomRelPath?: string;
  debugPass?: boolean;
  assetResolverEnabled?: boolean;
}

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
  /** Document kind (invoice / cv / proposal / ...). Drives render defaults. */
  docKind?: string;
  /** Render configuration consumed by the render runtime. */
  render?: RenderConfig;
  /** Set by revert-approved bookkeeping; carried verbatim when present. */
  previouslyApprovedRevisionId?: string | null;
  /** On-disk artifact contract version (see CURRENT_SCHEMA_VERSION). */
  schemaVersion?: number;
}

/**
 * Why an attempt stopped. Mirrors `failureCategories` in config/pipeline.json
 * and `$defs/failureCategory` in schemas/revision.schema.json — the three must
 * stay in step.
 */
export const FAILURE_CATEGORIES = [
  'BUILD_FAILED',
  'RENDER_FAILED',
  'ASSET_FAILED',
  'VISUAL_MISMATCH',
  'GRAPHCOMPOSE_API_LIMITATION',
  'MISSING_REFERENCE_INFORMATION',
  'ITERATION_LIMIT',
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

/** Pipeline stage a failure came from; mirrors `failure.stage` in the schema. */
export const FAILURE_STAGES = [
  'compile',
  'render',
  'preview',
  'visual-diff',
  'test',
  'asset-resolve',
  'skill-validate',
  'architecture-map',
  'unspecified',
] as const;

export type FailureStage = (typeof FAILURE_STAGES)[number];

/** The `failure` record a FAILED revision must carry (see revision.schema.json). */
export interface RevisionFailure {
  stage: FailureStage;
  summary: string;
  category?: FailureCategory;
  message?: string;
  currentUsableDraft?: string | null;
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
  /** On-disk artifact contract version (see CURRENT_SCHEMA_VERSION). */
  schemaVersion?: number;
  /** ISO 8601 timestamp written by approve when status flips to APPROVED. */
  approvedAt?: string;
  /** ISO 8601 timestamp written by approve when status flips to SUPERSEDED. */
  supersededAt?: string;
  /** Revision ID that superseded this one. */
  supersededBy?: string;
  /**
   * Optional template metadata the Template Publisher Agent or the
   * publish-template script writes back so the audit log shows which
   * bundle this revision became.
   */
  templateDisplayName?: string;
  /**
   * Free-form extras the schema permits (failure record, etc.). Listed
   * via index signature so future fields do not break the TS contract.
   */
  [extra: string]: unknown;
}

export interface CommandOptions {
  /** Project folder containing template-project.json. Defaults to cwd. */
  project?: string;
}
