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

test("every tool a stage names exists, and no stage points at a prompt file", () => {
  for (const [stageId, stage] of Object.entries(config.stages)) {
    assert.ok(STAGE_KINDS.includes(stage.kind), `stages.${stageId}.kind is not a known kind`);

    // Stages without a tool are performed by the workflow skill that owns the
    // scope. There is deliberately no per-stage file to point at any more: the
    // prompt chain that used to supply one has been removed.
    assert.equal(stage.prompt, undefined, `stages.${stageId} still names a prompt file`);
    if (!stage.tool) continue;
    assert.ok(
      fs.existsSync(path.join(repoRoot, stage.tool)),
      `stages.${stageId}.tool does not exist: ${stage.tool}`,
    );
  }
  assert.ok(
    !fs.existsSync(path.join(repoRoot, "prompts")),
    "prompts/ is back; the workflow skills are the contract now",
  );
});

test("every stage is labelled by what it does, not by the file that implements it", () => {
  // The label is what run-pipeline prints. Printing filenames is what sent
  // readers to the superseded prompt chain; a label survives its deletion.
  const seen = new Set();
  for (const [stageId, stage] of Object.entries(config.stages)) {
    assert.match(
      stage.label,
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      `stages.${stageId}.label should be a kebab-case verb phrase, got ${JSON.stringify(stage.label)}`,
    );
    assert.ok(!/prompt|agent|\.md$/.test(stage.label), `stages.${stageId}.label names a file, not a step`);
    assert.ok(!seen.has(stage.label), `two stages share the label "${stage.label}"`);
    seen.add(stage.label);
  }

  const source = fs.readFileSync(path.join(repoRoot, "scripts/run-pipeline.mjs"), "utf8");
  assert.ok(
    !/stage\.prompt/.test(source),
    "run-pipeline prints stage.prompt again, which points readers at the superseded chain",
  );
  assert.match(source, /stage\.label/, "run-pipeline no longer prints stage labels");
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

test("the failure category vocabulary agrees across every file that spells it out", () => {
  const fromRevision = readJson("schemas/revision.schema.json").$defs.failureCategory.enum;
  const fromReview = readJson("schemas/visual-review.schema.json").properties.failureCategory.enum;
  const fromTool = fs.readFileSync(path.join(repoRoot, "tools/revision-manager/src/types.ts"), "utf8");

  assert.deepEqual(
    [...fromRevision].sort(),
    [...config.failureCategories].sort(),
    "schemas/revision.schema.json and config/pipeline.json disagree about the failure categories",
  );
  assert.deepEqual(
    [...fromReview].sort(),
    [...config.failureCategories].sort(),
    "schemas/visual-review.schema.json and config/pipeline.json disagree about the failure categories",
  );
  for (const category of config.failureCategories) {
    assert.match(
      fromTool,
      new RegExp(`'${category}'`),
      `tools/revision-manager/src/types.ts is missing the ${category} category`,
    );
  }
});

test("the mismatch-cause vocabulary agrees between the config and the review schema", () => {
  // Same contract as the failure categories above, and the same reason: the
  // validator compiles each schema standalone, so the enum cannot be $ref-ed
  // across files and only a test keeps the copies honest.
  const fromReview = readJson("schemas/visual-review.schema.json")
    .properties.mismatches.items.properties.cause.enum;

  assert.deepEqual(
    [...fromReview].sort(),
    [...config.mismatchCauses].sort(),
    "schemas/visual-review.schema.json and config/pipeline.json disagree about the mismatch causes",
  );
  // UNKNOWN is not decoration. The classifier assigns only what two
  // measurements can decide, so a vocabulary with no way to say "I could not
  // tell" would force it to guess — which is the behaviour this whole track
  // exists to remove.
  assert.ok(config.mismatchCauses.includes("UNKNOWN"), "the vocabulary must be able to express an unresolved cause");
  for (const cause of ["GEOMETRY", "TYPOGRAPHY", "PAINT", "ASSET", "CONTENT", "PAGINATION"]) {
    assert.ok(config.mismatchCauses.includes(cause), `mismatchCauses is missing ${cause}`);
  }
});

test("the failure stage vocabulary agrees between the schema and the tool", () => {
  const fromSchema = readJson("schemas/revision.schema.json").properties.failure.properties.stage.enum;
  const fromTool = fs.readFileSync(path.join(repoRoot, "tools/revision-manager/src/types.ts"), "utf8");
  for (const stage of fromSchema) {
    assert.match(
      fromTool,
      new RegExp(`'${stage}'`),
      `tools/revision-manager/src/types.ts is missing the ${stage} failure stage`,
    );
  }
});

test("every structured artifact schema exists and is bound in the revision schema", () => {
  const labels = readJson("schemas/revision.schema.json").$defs.artifactsWithLabels.properties;
  for (const [schemaFile, label] of [
    ["orchestration.schema.json", "orchestrationDecisionJson"],
    ["visual-analysis.schema.json", "visualAnalysisJson"],
    ["architecture-plan.schema.json", "architecturePlanJson"],
    ["visual-review.schema.json", "visualReviewJson"],
  ]) {
    assert.ok(
      fs.existsSync(path.join(repoRoot, "schemas", schemaFile)),
      `schemas/${schemaFile} is missing`,
    );
    assert.ok(
      Object.hasOwn(labels, label),
      `revision.schema.json has no artifact label "${label}" for schemas/${schemaFile}`,
    );
  }
});

test("every declared workflow skill exists and is a well-formed skill", () => {
  const workflows = Object.entries(config.workflows).filter(([id]) => !id.startsWith("$"));
  assert.equal(workflows.length, 4, "expected the four user-gesture workflows");

  for (const [id, workflow] of workflows) {
    const file = path.join(repoRoot, workflow.skill);
    assert.ok(fs.existsSync(file), `workflows.${id}.skill does not exist: ${workflow.skill}`);

    const source = fs.readFileSync(file, "utf8");
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
    assert.ok(frontmatter, `${workflow.skill} has no YAML frontmatter`);
    assert.match(frontmatter[1], /^name:\s*\S+/m, `${workflow.skill} frontmatter has no name`);
    assert.match(frontmatter[1], /^description:\s*\S+/m, `${workflow.skill} frontmatter has no description`);

    // The description is what makes a skill fire without an explicit
    // invocation, so an empty-ish one silently disables the skill.
    const description = /^description:\s*(.+)$/m.exec(frontmatter[1])[1];
    assert.ok(
      description.length > 80,
      `${workflow.skill} description is too thin to trigger on (${description.length} chars)`,
    );
  }
});

test("every scope is reachable from some workflow, and every link in a skill resolves", () => {
  const workflows = Object.entries(config.workflows).filter(([id]) => !id.startsWith("$"));

  const reachable = new Set(workflows.flatMap(([, workflow]) => workflow.scopes));
  for (const scopeName of Object.keys(config.scopes)) {
    assert.ok(reachable.has(scopeName), `no workflow can open the "${scopeName}" scope`);
  }

  for (const [, workflow] of workflows) {
    const file = path.join(repoRoot, workflow.skill);
    const dir = path.dirname(file);
    const source = fs.readFileSync(file, "utf8");
    for (const [, target] of source.matchAll(/\]\((\.\.?\/[^)]+)\)/g)) {
      // The fragment is not part of the filename. Checking it as one reported a
      // perfectly good anchor link as a missing file.
      const [relPath, fragment] = target.split("#");
      const resolved = path.resolve(dir, relPath);
      assert.ok(fs.existsSync(resolved), `${workflow.skill} links to a missing file: ${relPath}`);

      // And an anchor that no longer names a heading is the same broken link
      // one edit later, so it is checked rather than skipped.
      if (fragment) {
        const headings = fs
          .readFileSync(resolved, "utf8")
          .split(/\r?\n/)
          .filter((line) => line.startsWith("#"))
          .map((line) => slugify(line.replace(/^#+\s*/, "")));
        assert.ok(
          headings.includes(fragment),
          `${workflow.skill} links to #${fragment}, which ${relPath} has no heading for`,
        );
      }
    }
  }
});

/** GitHub's heading slug: lower-cased, punctuation dropped, spaces hyphenated. */
function slugify(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s/g, "-");
}

test("the active pack has a loading map, and everything it names exists", () => {
  const manifest = readJson("skills/skill-manifest.json");
  const mapEntry = manifest.skills.find((skill) => skill.id === "graphcompose-loading-map");
  assert.ok(mapEntry, "the manifest declares no loading map for the active pack");

  const mapPath = path.join(repoRoot, "skills", mapEntry.file);
  assert.ok(fs.existsSync(mapPath), `loading map missing: skills/${mapEntry.file}`);

  const packDir = path.dirname(mapPath);
  const source = fs.readFileSync(mapPath, "utf8");
  for (const [, target] of source.matchAll(/\]\(([^)#]+\.md)\)/g)) {
    assert.ok(
      fs.existsSync(path.resolve(packDir, target)),
      `the loading map links to a missing file: ${target}`,
    );
  }
});

test("every skill in the active pack is reachable from the loading map", () => {
  const manifest = readJson("skills/skill-manifest.json");
  const mapEntry = manifest.skills.find((skill) => skill.id === "graphcompose-loading-map");
  const packPrefix = path.posix.dirname(mapEntry.file);
  const source = fs.readFileSync(path.join(repoRoot, "skills", mapEntry.file), "utf8");

  for (const skill of manifest.skills) {
    if (!skill.file.startsWith(`${packPrefix}/`)) continue; // frozen packs are not mapped
    if (skill.id === "graphcompose-loading-map") continue; // the map does not list itself

    const basename = path.posix.basename(skill.file);
    const named = source.includes(basename) || source.includes(skill.file.replace(`${packPrefix}/`, ""));
    assert.ok(named, `${skill.id} (${basename}) is in the pack but nothing in the loading map points at it`);
  }
});

test("every skill carries topic tags, and the always-loaded ones say so", () => {
  const manifest = readJson("skills/skill-manifest.json");
  for (const skill of manifest.skills) {
    assert.ok(
      Array.isArray(skill.topics) && skill.topics.length > 0,
      `${skill.id} has no topics array — the loading map cannot be derived from the manifest`,
    );
  }
  const always = manifest.skills.filter((skill) => skill.topics.includes("always")).map((s) => s.id);
  for (const required of ["graphcompose-api-surface", "graphcompose-basics"]) {
    assert.ok(always.includes(required), `${required} should be tagged "always"`);
  }
});

test("no bin reaches dist/ without its package's build guard in front of it", () => {
  // dist/ is gitignored, so a fresh clone or plugin install has none, and a
  // checkout can carry one compiled before its src/. Both are handled in each
  // package's bin/require-build.mjs — but only for the bins that call it, and
  // `region-diff.mjs` and `mask-regions.mjs` were once two lines that imported
  // dist/ directly, which is how a stale region ranking got reported as a
  // measured one. This enumerates bin/ instead of a hand-kept list, so a new
  // entry point cannot be added without a guard. What the guard then *does* is
  // driven for real in scripts/test/build-freshness.test.mjs.
  for (const tool of ["revision-manager", "visual-diff"]) {
    const binDir = path.join(repoRoot, "tools", tool, "bin");
    const guard = path.join(binDir, "require-build.mjs");
    assert.ok(fs.existsSync(guard), `tools/${tool}/bin has no require-build.mjs`);

    const guardSource = fs.readFileSync(guard, "utf8");
    assert.match(guardSource, /existsSync/, `tools/${tool}: the guard does not check for its build output`);
    assert.match(guardSource, /npm run setup/, `tools/${tool}: the guard does not name the fix`);
    assert.match(guardSource, /npm run build --prefix/, `tools/${tool}: the guard does not name the cheap rebuild`);

    const bins = fs.readdirSync(binDir).filter((name) => name.endsWith(".mjs") && name !== "require-build.mjs");
    assert.ok(bins.length > 0, `tools/${tool}/bin has no entry points`);
    for (const name of bins) {
      const source = fs.readFileSync(path.join(binDir, name), "utf8");
      assert.ok(
        !/^import ['"]\.\.\/dist/m.test(source),
        `tools/${tool}/bin/${name} imports dist statically, so the guard cannot run first`,
      );
      assert.match(source, /requireBuild\(/, `tools/${tool}/bin/${name} does not run the build guard`);
    }
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
    ["stage that reintroduces a prompt", (c) => { c.stages.orchestrator.prompt = "prompts/x.md"; }],
    ["stage without a label", (c) => { delete c.stages.orchestrator.label; }],
    ["scope referencing an unknown stage", (c) => { c.scopes["data-only"].stages.push("ghost"); }],
    ["scope referencing an unknown gate", (c) => { c.scopes["data-only"].gate = "vibes"; }],
    ["scope with no stages", (c) => { c.scopes["data-only"].stages = []; }],
    ["missing inferred new scope", (c) => { delete c.scopes.new; }],
    ["non-positive limit", (c) => { c.limits.maxIterations = 0; }],
    ["lowercase failure category", (c) => { c.failureCategories.push("oops"); }],
    ["duplicate failure category", (c) => { c.failureCategories.push("BUILD_FAILED"); }],
    ["lowercase mismatch cause", (c) => { c.mismatchCauses.push("geometry"); }],
    ["duplicate mismatch cause", (c) => { c.mismatchCauses.push("GEOMETRY"); }],
    ["missing mismatch causes", (c) => { delete c.mismatchCauses; }],
    ["gate without a comparison target", (c) => { c.gates["exact-diff"].comparedAgainst = "vibes"; }],
  ];
  for (const [name, mutate] of cases) {
    const broken = validFixture();
    mutate(broken);
    assert.throws(() => validatePipelineConfig(broken), PipelineConfigError, `should reject: ${name}`);
  }
});
