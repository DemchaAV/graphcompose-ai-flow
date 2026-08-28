#!/usr/bin/env node
/**
 * scripts/test/verify-published-template.test.mjs — the shape of the verdict.
 *
 * `approve-and-publish` decides whether to republish a bundle flat by reading
 * this command's `parity` field. That decision used to be made by matching a
 * regular expression against the problem text, which coupled two files through
 * the wording of one sentence: reword it and the fallback stops firing, with
 * nothing to notice that it had. The field is the contract now, so the contract
 * is pinned here.
 *
 * Only the static tier runs: `--build` and `--render` need Maven and a resolved
 * GraphCompose artifact, which is the "slow" half `verify.mjs` keeps for the
 * fixture step. What can be checked without a toolchain is the report's shape,
 * and that is the half a caller parses.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "verify-published-template.mjs");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcverifytest-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof contents === "string" ? contents : JSON.stringify(contents, null, 2), "utf8");
}

/** A workspace holding one bundle that passes every check needing no toolchain. */
function workspaceWithBundle({ label, sourceProject = null, sourceRevision = null, sources = null }) {
  const root = path.join(tempDir(label), "graphcompose-flow");
  const bundle = path.join(root, "templates", "demo-cv");

  write(path.join(root, "flow.config.json"), { schemaVersion: 1 });
  write(path.join(bundle, "template.json"), {
    id: "demo-cv",
    displayName: "Demo CV",
    version: "1.0.0",
    className: "DemoCvTemplate",
    sourceProject,
    sourceRevision,
    docKind: "cv",
    entrypoint: {
      templateClass: "com.example.cv.DemoCvTemplate",
      specClass: "com.example.cv.DemoCvSpec",
      providerClass: "com.example.cv.DemoCvSpecProvider",
    },
    data: { example: "data/cv-data.example.json", runtimeName: "cv-data.json" },
    layout: "flat",
    schemaVersion: "1.2.0",
    dependencies: { graphcompose: "2.2.2" },
  });
  for (const [name, body] of Object.entries(
    sources ?? { "DemoCvTemplate.java": "package com.example.cv;\npublic final class DemoCvTemplate {}\n" },
  )) {
    write(path.join(bundle, "src", name), body);
  }
  write(path.join(bundle, "data", "cv-data.example.json"), { name: "Demo" });
  write(path.join(bundle, "README.md"), "# Demo CV\n");

  return { root, bundle };
}

function verify(root, extra = []) {
  const run = spawnSync(
    process.execPath,
    [CLI, "--template-id", "demo-cv", "--root", root, "--json", ...extra],
    { encoding: "utf8" },
  );
  return { status: run.status, output: `${run.stdout}${run.stderr}`, parsed: JSON.parse(run.stdout) };
}

test("the report always carries the fields a caller branches on", () => {
  const { root } = workspaceWithBundle({ label: "shape" });
  const { parsed } = verify(root);

  // `parity` is what `approve-and-publish` reads to decide whether the
  // structured layout has to be given up. Its absence would read as "no parity
  // problem" and the fallback would never fire again.
  assert.ok("parity" in parsed, "the report has no parity field");
  assert.ok(Array.isArray(parsed.checks));
  assert.ok(Array.isArray(parsed.skipped), "a skipped check has nowhere to be reported");
  assert.ok(Array.isArray(parsed.problems));
});

test("without the render tier there is no parity verdict, and none is invented", () => {
  const { root } = workspaceWithBundle({ label: "no-render" });
  const { parsed } = verify(root);

  assert.equal(parsed.parity, null);
  assert.equal(parsed.verified, true, parsed.problems.join("; "));
});

test("a structured bundle's sub-packages are counted as sources", () => {
  const { root } = workspaceWithBundle({
    label: "structured",
    sources: {
      "DemoCvTemplate.java": "package com.example.cv;\npublic final class DemoCvTemplate {}\n",
      "theme/DemoCvTheme.java": "package com.example.cv.theme;\npublic final class DemoCvTheme {}\n",
      "sections/HeaderSection.java": "package com.example.cv.sections;\npublic final class HeaderSection {}\n",
    },
  });
  const { parsed } = verify(root);

  // The static tier used to `readdirSync` the top level only, so a structured
  // bundle read as one source and the sub-packages went unchecked.
  assert.ok(
    parsed.checks.some((c) => c.startsWith("3 Java source(s)")),
    `sources were counted as: ${parsed.checks.join(" | ")}`,
  );
  assert.ok(parsed.checks.some((c) => c.includes("className matches")));
});
