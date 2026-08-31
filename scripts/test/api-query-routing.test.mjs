#!/usr/bin/env node
/**
 * scripts/test/api-query-routing.test.mjs — the query CLI against all three
 * pack layouts, and against the routing table only one of them carries.
 *
 * ## Why this file exists
 *
 * The knowledge pipeline had a gap in the middle. `import-bundle.mjs` installs a
 * GraphCompose knowledge bundle into a version pack — `api/` split per surface,
 * `routing/`, `claims/`, `manifest.json` — and `api-query.mjs` went on reading
 * the flat `api-surface.json` the local extractor writes. So a 2.3 bundle could
 * be imported and then not asked: the CLI would report no allow-list for a pack
 * that was carrying a larger one than it had ever had.
 *
 * Routing is the half that has no flat equivalent at all. A surface answers
 * "does this exist"; it cannot answer "which of these three ways is right",
 * which is where wrong-API choices come from. That question had no command.
 *
 * ## How it is driven
 *
 * `api-query.mjs` resolves its packs from `installRoot()`, which is two levels
 * up from `scripts/lib/` — so a temp directory holding a copy of `scripts/` and
 * a `skills/versions/` of its own is a complete, isolated install. One is built
 * for the whole file with three packs in it, one per layout, and every case
 * picks the one it means with `--version`.
 *
 * The fixtures are small and hand-written rather than a slice of a real bundle:
 * what is under test is the reading, and a fixture whose every field is visible
 * on one screen is the one that says what a failure means.
 *
 * Run with the built-in runner (no dependencies):
 *
 *   node --test scripts/test/
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const temps = [];
process.on("exit", () => {
  for (const dir of temps) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcapi-${label}-`));
  temps.push(dir);
  return dir;
}

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

/** One member of a surface type, in the shape the extractor writes. */
const method = (name, returns, params = [], extra = {}) => ({
  kind: "method",
  name,
  returns,
  params,
  origin: "declared",
  static: false,
  ...extra,
});

/**
 * A complete install: the real `scripts/`, and three packs — one per layout.
 *
 * `scripts/test/` is skipped. It is the biggest thing under `scripts/` and none
 * of it is reachable from the CLI under test; copying it made the fixture cost
 * more than every assertion in this file put together.
 */
function install() {
  const root = tempDir("install");
  fs.cpSync(path.join(repoRoot, "scripts"), path.join(root, "scripts"), {
    recursive: true,
    filter: (src) => path.basename(src) !== "test",
  });

  // --- 2.3: a bundle-imported pack, split per surface, carrying routing ------
  const pack23 = path.join(root, "skills", "versions", "graphcompose-2.3");
  writeJson(path.join(pack23, "manifest.json"), {
    schemaVersion: 2,
    targetLibrary: "GraphCompose",
    targetVersion: "2.3.x",
    generator: "knowledge/tools/api-surface/extract-api.mjs",
  });
  writeJson(path.join(pack23, "api", "authoring.json"), {
    verifiedAgainst: "2.3.0",
    packages: [
      {
        name: "com.demcha.compose.document.dsl",
        types: [
          {
            name: "RowBuilder",
            kind: "class",
            binaryName: "com.demcha.compose.document.dsl.RowBuilder",
            stability: "stable",
            members: [
              method("weights", "RowBuilder", [{ type: "double...", name: "values" }]),
              method("addRow", "RowBuilder", []),
              { kind: "constant", name: "CENTER_LEFT" },
            ],
          },
          {
            name: "TimelineBuilder",
            kind: "class",
            stability: "beta",
            members: [method("entry", "TimelineBuilder", [{ type: "String", name: "label" }], { stability: "beta" })],
          },
        ],
      },
    ],
  });
  writeJson(path.join(pack23, "api", "templates.json"), {
    verifiedAgainst: "2.3.0",
    packages: [
      {
        name: "com.demcha.compose.document.templates.invoice",
        types: [{ name: "ModernInvoice", kind: "class", members: [method("render", "void", [])] }],
      },
    ],
  });
  // Never a surface: the extractor writes it beside them, and reading it as one
  // would answer "yes, it exists" for every symbol deliberately kept out.
  writeJson(path.join(pack23, "api", "excluded.json"), { types: ["SecretInternalThing"] });
  writeJson(path.join(pack23, "routing", "tasks.json"), {
    schemaVersion: 1,
    tasks: [
      {
        task: "layout.two-columns",
        intent: "Put two columns of content side by side on the page.",
        recommended: "row-with-weights",
        recommendedBecause: "a column that holds content flows and paginates with the main column.",
        alternatives: [
          {
            id: "page-background-column",
            useWhen: "the column is a tint that holds no content",
            tradeoffs: "costs nothing at layout time, but nothing can be placed in it",
          },
        ],
        constraints: ["row.rejects-a-nested-row"],
        symbols: ["RowBuilder.weights"],
        surfaces: ["authoring"],
        docs: ["docs/recipes/layered-page-design.md#sidebar-page-background-vs-row"],
        confirmedBy: "DemchaAV",
      },
      {
        task: "table.header-on-every-page",
        intent: "Keep a table's header visible past a page break.",
        recommended: "repeat-header",
        recommendedBecause: "repeatHeader() exists for exactly this.",
        alternatives: [],
        constraints: [],
        symbols: ["TableBuilder.repeatHeader"],
        surfaces: ["authoring"],
        docs: [],
        // No confirmedBy: an unreviewed route must not read like a reviewed one.
      },
    ],
  });

  // --- 2.2: the flat layout the local extractor writes ----------------------
  writeJson(path.join(root, "skills", "versions", "graphcompose-2.2", "api-surface.json"), {
    verifiedAgainst: "2.2.2",
    packages: [
      {
        name: "com.demcha.compose.document.dsl",
        types: [
          {
            name: "RowBuilder",
            kind: "class",
            members: [
              method("weights", "RowBuilder", [{ type: "double...", name: "values" }]),
              // Here so the flat layout can be asked every query the split one
              // can, and the two answers compared key for key.
              { kind: "constant", name: "CENTER_LEFT" },
            ],
          },
        ],
      },
    ],
  });

  return root;
}

const ROOT = install();
const CLI = path.join(ROOT, "scripts", "api-query.mjs");

function ask(...argv) {
  const run = spawnSync(process.execPath, [CLI, ...argv], { encoding: "utf8" });
  let parsed = null;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    /* an error path, or usage */
  }
  return { status: run.status, parsed, stdout: run.stdout ?? "", stderr: run.stderr ?? "" };
}

// ---------------------------------------------------------------- routing ---

test("--tasks lists every intent the routing table answers", () => {
  const { status, parsed, stderr } = ask("--version", "2.3", "--tasks");

  assert.equal(status, 0, stderr);
  assert.deepEqual(
    parsed.tasks.map((t) => t.task).sort(),
    ["layout.two-columns", "table.header-on-every-page"],
  );
  assert.match(parsed.tasks[0].intent, /\S/, "an intent with no text is not an answer");
});

test("--task returns the decision: the route, its cost, and the symbols to verify", () => {
  const { status, parsed, stderr } = ask("--version", "2.3", "--task", "layout.two-columns");

  assert.equal(status, 0, stderr);
  assert.equal(parsed.found, true);
  assert.equal(parsed.recommended, "row-with-weights");
  assert.match(parsed.recommendedBecause, /\S/);
  assert.equal(parsed.alternatives[0].id, "page-background-column");
  assert.match(parsed.alternatives[0].tradeoffs, /nothing can be placed/);
  assert.deepEqual(parsed.constraints, ["row.rejects-a-nested-row"]);
  assert.deepEqual(parsed.symbols, ["RowBuilder.weights"]);
  // The route ends the choice; it does not restate the guide. What it hands
  // back instead is one anchor — and where that anchor actually lives.
  assert.match(parsed.docsIn, /GraphCompose repository, not this workspace/);
  assert.equal(parsed.confirmed, true);
});

test("an unreviewed route says so rather than reading like a reviewed one", () => {
  const { status, parsed } = ask("--version", "2.3", "--task", "table.header-on-every-page");

  assert.equal(status, 0);
  assert.equal(parsed.confirmed, false);
  // Nothing to open: the field is omitted rather than offered empty.
  assert.equal(parsed.docsIn, undefined);
});

test("an intent the table does not answer exits 3 with the near misses", () => {
  const { status, parsed } = ask("--version", "2.3", "--task", "layout.two-column");

  assert.equal(status, 3, "a caller cannot branch on a miss that exits 0");
  assert.equal(parsed.found, false);
  assert.deepEqual(parsed.didYouMean, ["layout.two-columns"]);
  assert.ok(parsed.available.includes("table.header-on-every-page"), "the full list is not offered");
});

test("--surface with a route is refused, not accepted and ignored", () => {
  // Accepting it would be the worse half: the answer reads as filtered, and on
  // a flat pack the combination would slip past the bundle-pack refusal, since
  // routing is decided before that guard runs.
  for (const version of ["2.3", "2.2"]) {
    const { status, stderr } = ask("--version", version, "--surface", "authoring", "--task", "layout.two-columns");
    assert.equal(status, 2, `${version}: a combination that does nothing exited ${status}`);
    assert.match(stderr, /--surface does not apply to --task/);
  }
});

test("a routing answer leaves through the writer that waits for the pipe", () => {
  // `process.exit()` after a write truncates it on a pipe — that is how --dump
  // once failed CI on Linux while passing on Windows. Reading the whole answer
  // back through a pipe is the assertion that routing did not reintroduce it.
  const piped = spawnSync(
    process.execPath,
    ["-e", `const {execFileSync}=require("node:child_process");process.stdout.write(execFileSync(process.execPath,[${JSON.stringify(CLI)},"--version","2.3","--tasks"],{encoding:"utf8"}))`],
    { encoding: "utf8" },
  );
  const parsed = JSON.parse(piped.stdout);
  assert.equal(parsed.tasks.length, 2, "the answer arrived short through a pipe");
});

test("a pack that predates routing says which command would bring it", () => {
  const { status, stderr } = ask("--version", "2.2", "--task", "layout.two-columns");

  assert.equal(status, 1);
  assert.match(stderr, /no routing table for GraphCompose 2\.2/);
  assert.match(stderr, /import-bundle\.mjs/, "the message does not name the fix");
});

// --------------------------------------------------------------- surfaces ---

test("a bundle pack answers --type, and says which surface and how stable", () => {
  const { status, parsed, stderr } = ask("--version", "2.3", "--type", "TimelineBuilder");

  assert.equal(status, 0, stderr);
  assert.equal(parsed.type.surface, "authoring");
  assert.equal(parsed.type.stability, "beta", "a beta type read as stable is a green light it has not earned");
  assert.deepEqual(parsed.surfaces, ["authoring", "templates"]);
  assert.equal(parsed.verifiedAgainst, "2.3.0");
});

test("stable is the default and is left unsaid, so an answer is not noise", () => {
  const { parsed } = ask("--version", "2.3", "--type", "RowBuilder");

  assert.equal(parsed.type.surface, "authoring");
  assert.equal(parsed.type.stability, undefined);
  assert.ok(parsed.constants.includes("CENTER_LEFT"), "constants did not survive the split layout");
});

test("--exists resolves across the whole split, not one file of it", () => {
  const found = ask("--version", "2.3", "--exists", "ModernInvoice.render");
  assert.equal(found.status, 0, found.stderr);
  assert.equal(found.parsed.found, true);
  assert.equal(found.parsed.type.surface, "templates");

  const absent = ask("--version", "2.3", "--exists", "RowBuilder.notAThing");
  assert.equal(absent.status, 3);
  assert.equal(absent.parsed.found, false);
});

test("--surface restricts the search to one surface", () => {
  const all = ask("--version", "2.3", "--search", "render");
  assert.equal(all.status, 0, all.stderr);

  const authoring = ask("--version", "2.3", "--surface", "authoring", "--search", "render");
  assert.equal(authoring.status, 3, "ModernInvoice.render is not in the authoring surface");
  assert.deepEqual(authoring.parsed.surfaces, ["authoring"]);
});

test("a surface the pack does not have is named, with the ones it does", () => {
  const { status, stderr } = ask("--version", "2.3", "--surface", "backends", "--search", "row");

  assert.equal(status, 1);
  assert.match(stderr, /no surface "backends"/);
  assert.match(stderr, /authoring, templates/, "the available surfaces are not offered");
});

test("excluded.json is never read as a surface", () => {
  const { parsed } = ask("--version", "2.3", "--search", "SecretInternalThing");

  assert.equal(parsed.found, false, "a deliberately excluded symbol was reported as public API");
});

// ------------------------------------------------------- the older layouts ---

test("the flat layout still answers, and its shape is unchanged", () => {
  const { status, parsed, stderr } = ask("--version", "2.2", "--type", "RowBuilder");

  assert.equal(status, 0, stderr);
  assert.equal(parsed.verifiedAgainst, "2.2.2");
  // Neither field exists in that layout, so neither is invented: an old pack's
  // answer stays byte for byte what it was.
  assert.equal(parsed.type.surface, undefined);
  assert.equal(parsed.surfaces, undefined);
});

test("every query keeps the exact keys it had, on a pack with no surfaces", () => {
  // The first version of this change routed all four through one builder that
  // shaped the object itself, which gave --constant a `name` beside its `type`
  // — the same string twice — and handed --package back the package it had just
  // been asked for. Additive, harmless, and a broken promise: the claim is that
  // an old pack's answer does not change, so each shape is pinned here.
  const shapes = [
    [["--constant", "CENTER_LEFT"], "declaredBy", ["type", "package", "kind"]],
    [["--package", "com.demcha.compose.document.dsl"], "types", ["name", "kind", "methods"]],
    [["--search", "Row"], "types", ["name", "kind", "package", "methods"]],
  ];
  for (const [argv, field, keys] of shapes) {
    const { parsed, stderr } = ask("--version", "2.2", ...argv);
    assert.ok(parsed?.[field]?.length, `${argv[0]} returned nothing to check: ${stderr}`);
    assert.deepEqual(Object.keys(parsed[field][0]), keys, `${argv[0]} changed shape on a flat pack`);
  }
});

test("a bundle pack appends the two fields and reorders nothing", () => {
  const { parsed } = ask("--version", "2.3", "--constant", "CENTER_LEFT");

  assert.deepEqual(Object.keys(parsed.declaredBy[0]), ["type", "package", "kind", "surface"]);
});

test("--surface on a flat pack is refused with the command that would fix it", () => {
  const { status, stderr } = ask("--version", "2.2", "--surface", "authoring", "--search", "row");

  assert.equal(status, 2, "a usage error, not a silent whole-pack search");
  assert.match(stderr, /--surface needs a bundle-imported pack/);
  assert.match(stderr, /import-bundle\.mjs/);
});

test("with no --version the newest pack answers, which is the bundle one", () => {
  const { status, parsed, stderr } = ask("--type", "RowBuilder");

  assert.equal(status, 0, stderr);
  assert.equal(parsed.graphComposeLine, "2.3");
  assert.equal(parsed.type.surface, "authoring", "the newest pack was not the one asked");
});
