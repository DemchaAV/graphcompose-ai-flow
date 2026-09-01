#!/usr/bin/env node
/**
 * scripts/test/bundle-consistency.test.mjs — the bundle is held to its own
 * cross-references, and coverage is reported without failing anything.
 *
 * ## Why the split matters
 *
 * A knowledge bundle ships three files that point at each other: surfaces say
 * what exists, routes recommend a construction and name the symbols and
 * constraints behind it, claims record which page asserts what. Two kinds of
 * disagreement are possible and they deserve opposite treatment.
 *
 * A route naming a constraint no claim asserts is advice wearing the clothes of
 * a verified fact, and a route naming a symbol the surfaces lack has outlived
 * its API. Those fail: the data is untrustworthy.
 *
 * A capability with no route is a gap in coverage, not a contradiction — and
 * `routing/tasks.json` is imported, overwritten by the next import, and
 * authored upstream. Failing a build over it would leave a gate nobody in this
 * repository can clear. So coverage is printed and the exit code stays 0.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcbundle-${label}-`));
  temps.push(dir);
  return dir;
}

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

/**
 * A temp install: the real `scripts/`, and one bundle pack built to order.
 * `scripts/test/` is skipped — it is the bulk of the directory and the CLI
 * under test never reaches into it.
 */
function install(label, { routes = [], behavior = {}, capability = {}, surfaces = true } = {}) {
  const root = tempDir(label);
  fs.cpSync(path.join(repoRoot, "scripts"), path.join(root, "scripts"), {
    recursive: true,
    filter: (src) => path.basename(src) !== "test",
  });
  const pack = path.join(root, "skills", "versions", "graphcompose-2.3");
  writeJson(path.join(pack, "manifest.json"), { schemaVersion: 2, targetVersion: "2.3.x" });
  // The directory always exists — that is half of what makes a pack a bundle.
  // `surfaces: false` models a partial import: api/ arrived empty.
  fs.mkdirSync(path.join(pack, "api"), { recursive: true });
  if (surfaces) {
    writeJson(path.join(pack, "api", "authoring.json"), {
      verifiedAgainst: "2.3.0",
      packages: [
        {
          name: "com.demcha.compose.document.dsl",
          types: [
            {
              name: "TableBuilder",
              kind: "class",
              members: [
                { kind: "method", name: "repeatHeader", returns: "TableBuilder", params: [] },
                { kind: "method", name: "headerRow", returns: "TableBuilder", params: [] },
              ],
            },
          ],
        },
      ],
    });
  }
  writeJson(path.join(pack, "routing", "tasks.json"), { schemaVersion: 1, tasks: routes });
  writeJson(path.join(pack, "claims", "index.json"), {
    schemaVersion: 1,
    claims: { symbol: {}, capability, behavior },
  });
  return root;
}

const PAGE = [{ page: "docs/recipes/tables.md", line: 1, heading: "H", surface: "authoring" }];

const ROUTE = {
  task: "table.header-on-every-page",
  intent: "Keep a header visible past a page break.",
  recommended: "repeat-header",
  recommendedBecause: "documented for exactly this",
  alternatives: [],
  constraints: ["table.header-repeats-on-every-continuation-page"],
  symbols: ["TableBuilder.repeatHeader"],
  surfaces: ["authoring"],
  docs: [],
};

function run(root, ...argv) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "check-bundle-consistency.mjs"), ...argv], {
    encoding: "utf8",
  });
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    /* text mode, or an error path */
  }
  return { status: result.status, parsed, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

// ------------------------------------------------------------- consistency ---

test("a bundle whose references all resolve is consistent", () => {
  const root = install("clean", {
    routes: [ROUTE],
    behavior: { "table.header-repeats-on-every-continuation-page": PAGE },
  });
  const { status, parsed } = run(root, "--json");

  assert.equal(status, 0);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.problems, []);
  assert.equal(parsed.checked, "2.3");
});

test("a constraint no claim asserts fails, because it is advice dressed as a fact", () => {
  const root = install("unclaimed", { routes: [ROUTE], behavior: {} });
  const { status, parsed, out } = run(root, "--json");

  assert.equal(status, 1, out);
  assert.equal(parsed.problems.length, 1);
  assert.equal(parsed.problems[0].kind, "constraint-unclaimed");
  assert.equal(parsed.problems[0].id, "table.header-repeats-on-every-continuation-page");
});

test("a symbol the surfaces do not declare fails, because the route outlived its API", () => {
  const root = install("gone", {
    routes: [{ ...ROUTE, symbols: ["TableBuilder.repeatHeader", "TableBuilder.vanished"] }],
    behavior: { "table.header-repeats-on-every-continuation-page": PAGE },
  });
  const { status, parsed } = run(root, "--json");

  assert.equal(status, 1);
  assert.equal(parsed.problems.length, 1);
  assert.equal(parsed.problems[0].kind, "symbol-absent");
  assert.equal(parsed.problems[0].id, "TableBuilder.vanished");
});

test("an empty api/ does not invent symbol failures", () => {
  // Nothing to check against is not the same as everything missing. A bundle
  // whose api/ half arrived empty must not report every route as broken.
  const root = install("no-surfaces", {
    routes: [ROUTE],
    behavior: { "table.header-repeats-on-every-continuation-page": PAGE },
    surfaces: false,
  });
  const { status, parsed } = run(root, "--json");

  assert.equal(status, 0);
  assert.deepEqual(parsed.problems, []);
});

// ---------------------------------------------------------------- coverage ---

test("coverage is reported and never fails the build", () => {
  // routing/tasks.json is imported and overwritten by the next import, and it
  // is authored upstream. A gate that failed here could not be cleared from
  // this repository at all.
  const root = install("coverage", {
    routes: [ROUTE],
    behavior: {
      "table.header-repeats-on-every-continuation-page": PAGE,
      "table.explicit-row-style-beats-zebra": PAGE,
    },
    capability: { "table.zebra-striping": PAGE, "table.header-on-every-page": PAGE },
  });
  const { status, parsed } = run(root, "--json");

  assert.equal(status, 0, "a coverage gap must not fail a build");
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.coverage.capabilitiesWithoutRoute, ["table.zebra-striping"]);
  assert.deepEqual(parsed.coverage.behavioursNoRouteNames, ["table.explicit-row-style-beats-zebra"]);
});

test("the text report names the gaps, so the backlog is measured not remembered", () => {
  const root = install("text", {
    routes: [ROUTE],
    behavior: { "table.header-repeats-on-every-continuation-page": PAGE },
    capability: { "table.row-span": PAGE },
  });
  const { status, out } = run(root);

  assert.equal(status, 0);
  assert.match(out, /agrees with itself/);
  assert.match(out, /table\.row-span/);
});

// ------------------------------------------------------------- other packs ---

test("a tree with no bundle pack passes, saying there was nothing to check", () => {
  const root = tempDir("empty");
  fs.cpSync(path.join(repoRoot, "scripts"), path.join(root, "scripts"), {
    recursive: true,
    filter: (src) => path.basename(src) !== "test",
  });
  writeJson(path.join(root, "skills", "versions", "graphcompose-2.2", "api-surface.json"), {
    verifiedAgainst: "2.2.2",
    packages: [],
  });
  const { status, out } = run(root);

  assert.equal(status, 0);
  assert.match(out, /nothing to check/);
});

test("asking about a flat pack is a usage error, not a silent pass", () => {
  const root = install("flat-ask", {
    routes: [ROUTE],
    behavior: { "table.header-repeats-on-every-continuation-page": PAGE },
  });
  writeJson(path.join(root, "skills", "versions", "graphcompose-2.2", "api-surface.json"), {
    verifiedAgainst: "2.2.2",
    packages: [],
  });
  const { status, out } = run(root, "--version", "2.2");

  assert.equal(status, 2, "a flat pack has no routing; passing would claim it was checked");
  assert.match(out, /not a bundle pack/);
});
