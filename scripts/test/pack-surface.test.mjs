#!/usr/bin/env node
/**
 * scripts/test/pack-surface.test.mjs — one pack, three layouts, the same two
 * answers.
 *
 * ## Why this file exists
 *
 * `api-query.mjs` learned to read a bundle-imported pack when routing arrived.
 * Nothing else did, and the failure was quiet: importing GraphCompose 2.3 made
 * the newest pack a bundle, and both `check-knowledge-drift.mjs` and
 * `tools/api-surface/check-pack-freshness.mjs` announced "no allow-list" and
 * exited — the freshness gate going silent about a pack that was not stale but
 * newer than the gate could read.
 *
 * Both now read through `lib/pack-surface.mjs`, and this holds that module to
 * every layout directly rather than through whichever pack happens to be newest
 * in the repository. That indirection is exactly what let the regression in: the
 * checkers' own tests were passing against a 2.2 pack and said nothing about a
 * 2.3 one.
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

import { noAllowListHint, packLayout, packSymbols, packVerifiedAgainst } from "../lib/pack-surface.mjs";

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

function packDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcpack-${label}-`));
  temps.push(dir);
  return dir;
}

const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
};
const writeJson = (file, value) => write(file, `${JSON.stringify(value, null, 2)}\n`);

/** One extractor-shaped document with a type and a couple of members. */
const surfaceDoc = (verifiedAgainst) => ({
  verifiedAgainst,
  packages: [
    {
      name: "com.demcha.compose.document.dsl",
      types: [
        {
          name: "TimelineBuilder",
          kind: "class",
          members: [
            { kind: "method", name: "entry", returns: "TimelineBuilder", params: [] },
            { kind: "constant", name: "CENTER_LEFT" },
          ],
        },
      ],
    },
  ],
});

function bundlePack(label, { imported = true } = {}) {
  const dir = packDir(label);
  writeJson(path.join(dir, "manifest.json"), { schemaVersion: 2, targetVersion: "2.3.x" });
  writeJson(path.join(dir, "api", "authoring.json"), surfaceDoc("2.3.0-SNAPSHOT"));
  writeJson(path.join(dir, "api", "templates.json"), {
    verifiedAgainst: "2.3.0-SNAPSHOT",
    packages: [{ name: "t", types: [{ name: "ModernInvoice", kind: "class", members: [] }] }],
  });
  // Not a surface. Reading it as one would report every deliberately excluded
  // symbol as part of the allow-list.
  writeJson(path.join(dir, "api", "excluded.json"), { types: ["SecretInternalThing"] });
  if (imported) {
    writeJson(path.join(dir, "imported-from.json"), {
      bundle: "graph-compose-knowledge-2.3.0.zip",
      graphComposeVersion: "2.3.0",
    });
  }
  return dir;
}

function canonicalPack(label) {
  const dir = packDir(label);
  writeJson(path.join(dir, "api-surface.json"), surfaceDoc("2.2.2"));
  return dir;
}

function markdownPack(label) {
  const dir = packDir(label);
  write(
    path.join(dir, "00-api-surface.md"),
    ["---", "verifiedAgainst: 1.9.4", "---", "", "### TimelineBuilder (class)", "", "- `TimelineBuilder entry(String label)`", ""].join("\n"),
  );
  return dir;
}

// ----------------------------------------------------------------- layouts ---

test("each layout is recognised, and a pack with none says so", () => {
  assert.equal(packLayout(bundlePack("layout-bundle")), "bundle");
  assert.equal(packLayout(canonicalPack("layout-canonical")), "canonical");
  assert.equal(packLayout(markdownPack("layout-markdown")), "markdown");
  assert.equal(packLayout(packDir("layout-empty")), "none");
});

test("a bundle needs both halves, so a bare api/ is not mistaken for one", () => {
  // `manifest.json` is what import-bundle writes to say the import finished.
  // Without it, a half-copied directory would read as a complete pack.
  const dir = packDir("half");
  writeJson(path.join(dir, "api", "authoring.json"), surfaceDoc("2.3.0"));
  assert.equal(packLayout(dir), "none");
});

// ----------------------------------------------------------------- symbols ---

test("every layout yields the same symbols for the same content", () => {
  for (const [label, dir] of [
    ["bundle", bundlePack("sym-bundle")],
    ["canonical", canonicalPack("sym-canonical")],
    ["markdown", markdownPack("sym-markdown")],
  ]) {
    const symbols = packSymbols(dir);
    assert.ok(symbols.has("TimelineBuilder"), `${label}: the type is missing`);
    assert.ok(symbols.has("entry"), `${label}: the member is missing`);
  }
});

test("a bundle's symbols span every surface, and never excluded.json", () => {
  const symbols = packSymbols(bundlePack("sym-span"));

  assert.ok(symbols.has("TimelineBuilder"), "authoring did not contribute");
  assert.ok(symbols.has("ModernInvoice"), "the second surface was not read");
  assert.ok(!symbols.has("SecretInternalThing"), "excluded.json was read as a surface");
});

test("constants count as symbols, since a document can name one", () => {
  assert.ok(packSymbols(bundlePack("sym-const")).has("CENTER_LEFT"));
  assert.ok(packSymbols(canonicalPack("sym-const-flat")).has("CENTER_LEFT"));
});

test("a pack with no allow-list yields null, not an empty set", () => {
  // The difference decides the caller's message: empty means "this line has no
  // symbols", null means "nothing here can answer".
  assert.equal(packSymbols(packDir("sym-none")), null);
});

// ---------------------------------------------------------------- versions ---

test("each layout says which release it describes", () => {
  assert.equal(packVerifiedAgainst(canonicalPack("ver-canonical")), "2.2.2");
  assert.equal(packVerifiedAgainst(markdownPack("ver-markdown")), "1.9.4");
  assert.equal(packVerifiedAgainst(packDir("ver-none")), null);
});

test("a bundle is dated by its import record, not by the build that generated it", () => {
  // The surfaces inside the 2.3.0 release say 2.3.0-SNAPSHOT, because that is
  // what the build calling itself. The import record holds the released version
  // the archive was actually cut from, which is what a freshness check compares.
  assert.equal(packVerifiedAgainst(bundlePack("ver-bundle")), "2.3.0");
  assert.equal(
    packVerifiedAgainst(bundlePack("ver-bundle-raw", { imported: false })),
    "2.3.0-SNAPSHOT",
    "without an import record the surfaces are the next best answer, not nothing",
  );
});

test("the hint names both ways an allow-list arrives", () => {
  const hint = noAllowListHint("graphcompose-2.4");

  assert.match(hint, /graphcompose-2\.4/);
  assert.match(hint, /import-bundle\.mjs/, "the released path is not named");
  assert.match(hint, /extract-api\.mjs/, "the local path is not named");
});
