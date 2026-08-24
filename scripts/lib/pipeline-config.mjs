#!/usr/bin/env node
/**
 * scripts/lib/pipeline-config.mjs — the single reader for config/pipeline.json.
 *
 * The scope -> stage routing used to be restated in three places
 * (scripts/run-pipeline.mjs, prompts/orchestrator-agent.md, and the `scope`
 * description in schemas/revision.schema.json), which is how the docs came to
 * disagree with the code. Everything that needs the routing now loads it from
 * here, and scripts/test/pipeline-config.test.mjs fails the build when a copy
 * drifts.
 *
 * This module validates STRUCTURE only. It deliberately does not check that the
 * referenced prompt files exist on disk: run-pipeline.mjs reports a missing
 * prompt inline with a "!" marker, and turning that into a load-time crash would
 * change its behaviour. File existence is the contract test's job.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CONFIG_RELATIVE_PATH = "config/pipeline.json";

/** Stage classifications from docs/architecture.md. */
export const STAGE_KINDS = Object.freeze(["llm", "tool", "gate"]);

/** Scope inferred for a first revision; never written into revision.json. */
export const INFERRED_NEW_SCOPE = "new";

/** Scope used when a revision has a parent but records no explicit scope. */
export const DEFAULT_REVISION_SCOPE = "visual-change";

const DEFAULT_REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

/** Raised for any structural problem in config/pipeline.json. */
export class PipelineConfigError extends Error {
  constructor(message) {
    super(`[pipeline-config] ${message}`);
    this.name = "PipelineConfigError";
  }
}

/**
 * Load and validate config/pipeline.json.
 *
 * @param {{ repoRoot?: string }} [options]
 * @returns {object} the validated config
 * @throws {PipelineConfigError} when the file is missing, unparseable or invalid
 */
export function loadPipelineConfig({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const file = path.join(repoRoot, CONFIG_RELATIVE_PATH);
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (cause) {
    throw new PipelineConfigError(`cannot read ${CONFIG_RELATIVE_PATH}: ${cause.message}`);
  }

  let config;
  try {
    config = JSON.parse(raw);
  } catch (cause) {
    throw new PipelineConfigError(`${CONFIG_RELATIVE_PATH} is not valid JSON: ${cause.message}`);
  }

  return validatePipelineConfig(config);
}

/**
 * Validate an already-parsed config object.
 *
 * @param {unknown} config
 * @returns {object} the same object, once every check passes
 * @throws {PipelineConfigError}
 */
export function validatePipelineConfig(config) {
  if (!isPlainObject(config)) throw new PipelineConfigError("config must be an object");
  if (config.schemaVersion !== 1) {
    throw new PipelineConfigError(
      `unsupported schemaVersion ${JSON.stringify(config.schemaVersion)} (this reader understands 1)`,
    );
  }

  validateStages(config.stages);
  validateGates(config.gates);
  validateScopes(config.scopes, config.stages, config.gates);
  validateWorkflows(config.workflows, config.scopes);
  validateLimits(config.limits);
  validateFailureCategories(config.failureCategories);

  return config;
}

function validateWorkflows(workflows, scopes) {
  if (workflows === undefined) return; // optional until every consumer declares one
  if (!isPlainObject(workflows)) throw new PipelineConfigError("workflows must be an object");
  for (const [id, workflow] of Object.entries(workflows)) {
    if (id.startsWith("$")) continue; // $comment and friends
    const at = `workflows.${id}`;
    if (!isPlainObject(workflow)) throw new PipelineConfigError(`${at} must be an object`);
    requireNonEmptyString(workflow.skill, `${at}.skill`);
    requireNonEmptyString(workflow.summary, `${at}.summary`);
    if (!Array.isArray(workflow.scopes)) {
      throw new PipelineConfigError(`${at}.scopes must be an array (empty when it opens no revision)`);
    }
    for (const scopeName of workflow.scopes) {
      if (!Object.hasOwn(scopes, scopeName)) {
        throw new PipelineConfigError(`${at}.scopes references unknown scope ${JSON.stringify(scopeName)}`);
      }
    }
  }
}

function validateStages(stages) {
  if (!isPlainObject(stages) || Object.keys(stages).length === 0) {
    throw new PipelineConfigError("stages must be a non-empty object");
  }
  for (const [id, stage] of Object.entries(stages)) {
    const at = `stages.${id}`;
    if (!isPlainObject(stage)) throw new PipelineConfigError(`${at} must be an object`);
    if (!STAGE_KINDS.includes(stage.kind)) {
      throw new PipelineConfigError(
        `${at}.kind must be one of ${STAGE_KINDS.join(" | ")}, got ${JSON.stringify(stage.kind)}`,
      );
    }
    requireNonEmptyString(stage.prompt, `${at}.prompt`);
    requireNonEmptyString(stage.description, `${at}.description`);
    if (stage.tool !== undefined) requireNonEmptyString(stage.tool, `${at}.tool`);
  }
}

function validateGates(gates) {
  if (!isPlainObject(gates) || Object.keys(gates).length === 0) {
    throw new PipelineConfigError("gates must be a non-empty object");
  }
  for (const [id, gate] of Object.entries(gates)) {
    const at = `gates.${id}`;
    if (!isPlainObject(gate)) throw new PipelineConfigError(`${at} must be an object`);
    requireNonEmptyString(gate.summary, `${at}.summary`);
    requireNonEmptyString(gate.rule, `${at}.rule`);
    if (!["parent", "reference"].includes(gate.comparedAgainst)) {
      throw new PipelineConfigError(
        `${at}.comparedAgainst must be "parent" or "reference", got ${JSON.stringify(gate.comparedAgainst)}`,
      );
    }
  }
}

function validateScopes(scopes, stages, gates) {
  if (!isPlainObject(scopes) || Object.keys(scopes).length === 0) {
    throw new PipelineConfigError("scopes must be a non-empty object");
  }
  if (!Object.hasOwn(scopes, INFERRED_NEW_SCOPE)) {
    throw new PipelineConfigError(`scopes is missing the inferred "${INFERRED_NEW_SCOPE}" scope`);
  }
  for (const [id, scope] of Object.entries(scopes)) {
    const at = `scopes.${id}`;
    if (!isPlainObject(scope)) throw new PipelineConfigError(`${at} must be an object`);
    requireNonEmptyString(scope.description, `${at}.description`);
    if (!isPlainObject(gates) || !Object.hasOwn(gates, scope.gate)) {
      throw new PipelineConfigError(
        `${at}.gate ${JSON.stringify(scope.gate)} is not declared under gates`,
      );
    }
    if (!Array.isArray(scope.stages) || scope.stages.length === 0) {
      throw new PipelineConfigError(`${at}.stages must be a non-empty array`);
    }
    for (const stageId of scope.stages) {
      if (!Object.hasOwn(stages, stageId)) {
        throw new PipelineConfigError(
          `${at}.stages references unknown stage ${JSON.stringify(stageId)}`,
        );
      }
    }
  }
}

function validateLimits(limits) {
  if (!isPlainObject(limits)) throw new PipelineConfigError("limits must be an object");
  for (const key of ["maxIterations", "maxConsecutiveBuildFailures", "maxSameMismatchAttempts"]) {
    const value = limits[key];
    if (!Number.isInteger(value) || value < 1) {
      throw new PipelineConfigError(
        `limits.${key} must be a positive integer, got ${JSON.stringify(value)}`,
      );
    }
  }
}

function validateFailureCategories(categories) {
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new PipelineConfigError("failureCategories must be a non-empty array");
  }
  const seen = new Set();
  for (const category of categories) {
    if (typeof category !== "string" || !/^[A-Z][A-Z_]*[A-Z]$/.test(category)) {
      throw new PipelineConfigError(
        `failureCategories entries must be SCREAMING_SNAKE_CASE, got ${JSON.stringify(category)}`,
      );
    }
    if (seen.has(category)) {
      throw new PipelineConfigError(`failureCategories contains a duplicate: ${category}`);
    }
    seen.add(category);
  }
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value, at) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PipelineConfigError(`${at} must be a non-empty string, got ${JSON.stringify(value)}`);
  }
}

/**
 * Scope names a caller may pass, ordered with the inferred "new" first so the
 * list reads the same way run-pipeline.mjs used to print it.
 *
 * @param {object} config
 * @returns {string[]}
 */
export function scopeNames(config) {
  const rest = Object.keys(config.scopes).filter((s) => s !== INFERRED_NEW_SCOPE);
  return [INFERRED_NEW_SCOPE, ...rest];
}

/**
 * Resolve which scope applies: an explicit flag wins, then the scope recorded in
 * revision.json, then inference from whether this is a first revision.
 *
 * @param {{ explicitScope?: string|null, revision?: object|null, revisionId?: string }} input
 * @returns {string}
 */
export function resolveScope({ explicitScope = null, revision = null, revisionId = "" } = {}) {
  if (explicitScope) return explicitScope;
  if (revision && revision.scope) return revision.scope;
  const isFirst = revisionId === "revision-001" || (revision && revision.parentRevisionId == null);
  return isFirst ? INFERRED_NEW_SCOPE : DEFAULT_REVISION_SCOPE;
}

/**
 * The ordered stages of a scope, each resolved against the stage catalogue.
 *
 * @param {object} config
 * @param {string} scopeName
 * @returns {Array<{ id: string, kind: string, prompt: string, tool?: string, description: string }>|null}
 *          null when the scope is unknown, so callers can print their own error
 */
export function stagesForScope(config, scopeName) {
  const scope = config.scopes[scopeName];
  if (!scope) return null;
  return scope.stages.map((id) => ({ id, ...config.stages[id] }));
}
