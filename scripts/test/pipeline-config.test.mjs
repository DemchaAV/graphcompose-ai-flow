#!/usr/bin/env node
/**
 * scripts/test/pipeline-config.test.mjs — the contract test for
 * config/pipeline.json.
 *
 * Phase 1 of the harness migration collapsed three copies of the scope -> stage
 * routing into one file. This test is what stops them growing back: it checks
 * the config against the revision schema, against the filesystem, and against
 * the scripts that consume it, then exercises the loader's rejection paths.
 *
 * Run with the built-in runner (no dependencies):
 *
 *   node --test scripts/test/
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  INFERRED_NEW_SCOPE,
  PipelineConfigError,
  STAGE_KINDS,
  loadPipelineConfig,
  resolveScope,
  scopeNames,
  stagesForScope,
  validatePipelineConfig,
} from "../lib/pipeline-config.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const config = loadPipelineConfig({ repoRoot });

const readJson = (relative) =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, relative), "utf8"));

/** A structurally valid config, cloned per test so mutations stay local. */
const validFixture = () => structuredClone(config);

test("the shipped config loads and validates", () => {
  assert.equal(config.schemaVersion, 1);
  assert.ok(Object.keys(config.scopes).length > 0);
});

test("scopes match the revision schema enum, plus the inferred new scope", () => {
  const schemaScopes = readJson("schemas/revision.schema.json").properties.scope.enum;
  const configScopes = Object.keys(config.scopes);

  assert.ok(
    configScopes.includes(INFERRED_NEW_SCOPE),
    `config is missing the inferred "${INFERRED_NEW_SCOPE}" scope`,
  );
  assert.deepEqual(
    configScopes.filter((s) => s !== INFERRED_NEW_SCOPE).sort(),
    [...schemaScopes].sort(),
    "config/pipeline.json and schemas/revision.schema.json disagree about the scope set",
  );
  assert.ok(
    !schemaScopes.includes(INFERRED_NEW_SCOPE),
    `"${INFERRED_NEW_SCOPE}" is inferred, so it must not be written into revision.json`,
  );
});

test("every stage referenced by a scope exists, and every stage is reachable", () => {
  const referenced = new Set();
  for (const [scopeName, scope] of Object.entries(config.scopes)) {
    for (const stageId of scope.stages) {
      assert.ok(
        Object.hasOwn(config.stages, stageId),
        `scopes.${scopeName} references unknown stage "${stageId}"`,
      );
      referenced.add(stageId);
    }
  }
  for (const stageId of Object.keys(config.stages)) {
    assert.ok(referenced.has(stageId), `stage "${stageId}" is declared but no scope runs it`);
  }
});

test("every prompt and tool a stage names exists on disk", () => {
  for (const [stageId, stage] of Object.entries(config.stages)) {
    assert.ok(STAGE_KINDS.includes(stage.kind), `stages.${stageId}.kind is not a known kind`);
    assert.ok(
      fs.existsSync(path.join(repoRoot, stage.prompt)),
      `stages.${stageId}.prompt does not exist: ${stage.prompt}`,
    );
    if (stage.tool) {
      assert.ok(
        fs.existsSync(path.join(repoRoot, stage.tool)),
        `stages.${stageId}.tool does not exist: ${stage.tool}`,
      );
    }
  }
});

test("every scope names a declared gate, and every gate is used", () => {
  const used = new Set(Object.values(config.scopes).map((scope) => scope.gate));
  for (const [scopeName, scope] of Object.entries(config.scopes)) {
    assert.ok(
      Object.hasOwn(config.gates, scope.gate),
      `scopes.${scopeName}.gate "${scope.gate}" is not declared under gates`,
    );
  }
  for (const gateId of Object.keys(config.gates)) {
    assert.ok(used.has(gateId), `gate "${gateId}" is declared but no scope uses it`);
  }
});

test("the preflight contract points at scripts that exist", () => {
  const { skillValidation } = config.preflight;
  for (const key of ["enforcedBy", "calledFrom"]) {
    assert.ok(
      fs.existsSync(path.join(repoRoot, skillValidation[key])),
      `preflight.skillValidation.${key} does not exist: ${skillValidation[key]}`,
    );
  }
  const caller = fs.readFileSync(path.join(repoRoot, skillValidation.calledFrom), "utf8");
  assert.match(
    caller,
    /skill-validation-gate\.mjs/,
    `${skillValidation.calledFrom} no longer imports the skill validation gate, so the ` +
      "preflight claim in config/pipeline.json is stale",
  );
});

test("limits and failure categories are present and sane", () => {
  for (const key of ["maxIterations", "maxConsecutiveBuildFailures", "maxSameMismatchAttempts"]) {
    assert.ok(Number.isInteger(config.limits[key]) && config.limits[key] > 0);
  }
  for (const category of [
    "BUILD_FAILED",
    "RENDER_FAILED",
    "ASSET_FAILED",
    "VISUAL_MISMATCH",
    "GRAPHCOMPOSE_API_LIMITATION",
    "MISSING_REFERENCE_INFORMATION",
    "ITERATION_LIMIT",
  ]) {
    assert.ok(
      config.failureCategories.includes(category),
      `failureCategories is missing ${category} (docs/architecture.md names it)`,
    );
  }
});

test("run-pipeline.mjs holds no chain of its own", () => {
  const source = fs.readFileSync(path.join(repoRoot, "scripts/run-pipeline.mjs"), "utf8");
  assert.ok(
    !source.includes("SUBCHAINS"),
    "scripts/run-pipeline.mjs reintroduced a hardcoded SUBCHAINS map",
  );
  assert.match(
    source,
    /lib\/pipeline-config\.mjs/,
    "scripts/run-pipeline.mjs no longer reads the routing from config/pipeline.json",
  );
});

test("scope resolution follows flag > revision.json > inference", () => {
  assert.equal(resolveScope({ explicitScope: "theme-only", revisionId: "revision-001" }), "theme-only");
  assert.equal(
    resolveScope({ revision: { scope: "asset-only", parentRevisionId: "revision-001" }, revisionId: "revision-002" }),
    "asset-only",
  );
  assert.equal(resolveScope({ revisionId: "revision-001" }), INFERRED_NEW_SCOPE);
  assert.equal(
    resolveScope({ revision: { parentRevisionId: null }, revisionId: "revision-004" }),
    INFERRED_NEW_SCOPE,
  );
  assert.equal(
    resolveScope({ revision: { parentRevisionId: "revision-003" }, revisionId: "revision-004" }),
    "visual-change",
  );
});

test("stagesForScope resolves the catalogue and reports unknown scopes as null", () => {
  const stages = stagesForScope(config, "data-only");
  assert.deepEqual(
    stages.map((s) => s.id),
    config.scopes["data-only"].stages,
  );
  assert.ok(stages.every((s) => typeof s.description === "string"));
  assert.equal(stagesForScope(config, "no-such-scope"), null);
  assert.equal(scopeNames(config)[0], INFERRED_NEW_SCOPE);
});

test("the loader rejects structurally broken configs", () => {
  const cases = [
    ["wrong schemaVersion", (c) => { c.schemaVersion = 2; }],
    ["unknown stage kind", (c) => { c.stages.orchestrator.kind = "wizard"; }],
    ["stage without a prompt", (c) => { delete c.stages.orchestrator.prompt; }],
    ["scope referencing an unknown stage", (c) => { c.scopes["data-only"].stages.push("ghost"); }],
    ["scope referencing an unknown gate", (c) => { c.scopes["data-only"].gate = "vibes"; }],
    ["scope with no stages", (c) => { c.scopes["data-only"].stages = []; }],
    ["missing inferred new scope", (c) => { delete c.scopes.new; }],
    ["non-positive limit", (c) => { c.limits.maxIterations = 0; }],
    ["lowercase failure category", (c) => { c.failureCategories.push("oops"); }],
    ["duplicate failure category", (c) => { c.failureCategories.push("BUILD_FAILED"); }],
    ["gate without a comparison target", (c) => { c.gates["exact-diff"].comparedAgainst = "vibes"; }],
  ];
  for (const [name, mutate] of cases) {
    const broken = validFixture();
    mutate(broken);
    assert.throws(() => validatePipelineConfig(broken), PipelineConfigError, `should reject: ${name}`);
  }
});
