/**
 * scripts/lib/pack-surface.mjs — read a version pack's allow-list, whichever
 * layout it happens to be in.
 *
 * ## Why
 *
 * A pack is whatever the line it describes could produce, and there are three:
 *
 *   `api/` + `manifest.json`   imported from a GraphCompose knowledge bundle
 *   `api-surface.json`         written by the local extractor
 *   `00-api-surface.md`        prose, for lines that predate the extractor
 *
 * `api-query.mjs` learned all three when routing arrived. Everything else that
 * reads a pack did not, and the failure was silent in the worst way: importing
 * GraphCompose 2.3 made the newest pack a bundle, and both
 * `check-knowledge-drift.mjs` and `tools/api-surface/check-pack-freshness.mjs`
 * announced "no allow-list" for a pack carrying a larger one than the line had
 * ever had — the freshness gate reporting nothing while the pack it was meant
 * to watch sat right there.
 *
 * A checker that cannot read the newest pack does not fail loudly enough to be
 * noticed: it exits, says a file is missing, and the thing it was guarding goes
 * unguarded. So the reading lives here once, and the two questions those
 * checkers actually ask — which symbols does this line have, and which release
 * does it describe — are answered from whichever layout is on disk.
 *
 * The structured forms are preferred where a pack has both: the Markdown is
 * generated from the JSON, so parsing prose to recover what the JSON already
 * states is a second chance to be wrong.
 */

import fs from "node:fs";
import path from "node:path";

/** The layouts, newest first. A pack is the first one it matches. */
export const LAYOUTS = Object.freeze(["bundle", "canonical", "markdown", "none"]);

/**
 * Which layout a pack directory is in.
 *
 * A bundle needs both halves: `api/` alone could be a directory someone made,
 * and `manifest.json` is what `import-bundle.mjs` writes to say the import
 * completed.
 *
 * @param {string} packDir
 * @returns {"bundle"|"canonical"|"markdown"|"none"}
 */
export function packLayout(packDir) {
  if (fs.existsSync(path.join(packDir, "api")) && fs.existsSync(path.join(packDir, "manifest.json"))) {
    return "bundle";
  }
  if (fs.existsSync(path.join(packDir, "api-surface.json"))) return "canonical";
  if (fs.existsSync(path.join(packDir, "00-api-surface.md"))) return "markdown";
  return "none";
}

/** Every surface JSON in a bundle pack. `excluded.json` is not one. */
function bundleSurfaceFiles(packDir) {
  const apiDir = path.join(packDir, "api");
  return fs
    .readdirSync(apiDir)
    .filter((f) => f.endsWith(".json") && f !== "excluded.json")
    .sort()
    .map((f) => path.join(apiDir, f));
}

/** Type names and member names out of one extractor-shaped document. */
function symbolsFromCanonical(doc, into) {
  for (const pkg of doc.packages ?? []) {
    for (const type of pkg.types ?? []) {
      if (type.name) into.add(type.name);
      for (const member of type.members ?? []) {
        if (member.name) into.add(member.name);
      }
    }
  }
  return into;
}

/**
 * The names this line has: every public type, and every member of one.
 *
 * Bare names rather than `Type.member` pairs, on purpose: `addTimeline` is
 * declared on a generic flow type, so `api-query --exists
 * SectionBuilder.addTimeline` answers "absent" while the method is callable on
 * a section. A checker that took the type-qualified answer would miss the exact
 * claim it exists to catch — a document naming a primitive with no receiver.
 *
 * @param {string} packDir
 * @returns {Set<string>|null} null when the pack has no allow-list in any layout
 */
export function packSymbols(packDir) {
  const symbols = new Set();
  switch (packLayout(packDir)) {
    case "bundle":
      for (const file of bundleSurfaceFiles(packDir)) {
        symbolsFromCanonical(JSON.parse(fs.readFileSync(file, "utf8")), symbols);
      }
      return symbols;
    case "canonical":
      return symbolsFromCanonical(
        JSON.parse(fs.readFileSync(path.join(packDir, "api-surface.json"), "utf8")),
        symbols,
      );
    case "markdown": {
      // The prose form, and the only one that has to be parsed: a member is a
      // list item whose backticked signature opens a parameter list, a type is
      // a level-three heading.
      const source = fs.readFileSync(path.join(packDir, "00-api-surface.md"), "utf8");
      for (const [, name] of source.matchAll(/^- `[^`]*?\b(\w+)\s*\(/gm)) symbols.add(name);
      for (const [, name] of source.matchAll(/^### (\w+)/gm)) symbols.add(name);
      return symbols;
    }
    default:
      return null;
  }
}

/**
 * Which GraphCompose release this pack describes, or null.
 *
 * For a bundle the import record is preferred over the surfaces' own field: it
 * is the released version the archive was cut from, checksum and commit
 * included, where `verifiedAgainst` inside a surface is whatever the build that
 * generated it called itself — which for a pre-release build is a snapshot.
 *
 * @param {string} packDir
 * @returns {string|null}
 */
export function packVerifiedAgainst(packDir) {
  switch (packLayout(packDir)) {
    case "bundle": {
      const imported = path.join(packDir, "imported-from.json");
      if (fs.existsSync(imported)) {
        const record = JSON.parse(fs.readFileSync(imported, "utf8"));
        if (record.graphComposeVersion) return record.graphComposeVersion;
      }
      for (const file of bundleSurfaceFiles(packDir)) {
        const doc = JSON.parse(fs.readFileSync(file, "utf8"));
        if (doc.verifiedAgainst) return doc.verifiedAgainst;
      }
      const manifest = JSON.parse(fs.readFileSync(path.join(packDir, "manifest.json"), "utf8"));
      return manifest.targetVersion ?? null;
    }
    case "canonical":
      return JSON.parse(fs.readFileSync(path.join(packDir, "api-surface.json"), "utf8")).verifiedAgainst ?? null;
    case "markdown": {
      const front = fs.readFileSync(path.join(packDir, "00-api-surface.md"), "utf8").slice(0, 2000);
      return front.match(/^verifiedAgainst:\s*(\S+)\s*$/m)?.[1] ?? null;
    }
    default:
      return null;
  }
}

/**
 * What to tell someone whose pack has no allow-list at all, naming both ways
 * one arrives. Kept here so the two checkers say the same thing.
 *
 * @param {string} packName
 * @returns {string}
 */
export function noAllowListHint(packName) {
  return (
    `${packName} carries no allow-list in any layout.\n` +
    "  A released line brings one in its knowledge bundle:\n" +
    "    node tools/api-surface/import-bundle.mjs --from <bundle.zip>\n" +
    "  An unreleased one is extracted locally:\n" +
    "    node tools/api-surface/extract-api.mjs\n"
  );
}
