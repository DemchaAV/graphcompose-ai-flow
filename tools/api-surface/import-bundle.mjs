#!/usr/bin/env node
/**
 * tools/api-surface/import-bundle.mjs — install a GraphCompose knowledge bundle
 * as a version-pinned pack.
 *
 *   node tools/api-surface/import-bundle.mjs --from <bundle.zip>
 *   node tools/api-surface/import-bundle.mjs --from <bundle.zip> --check
 *
 * Exit 0 imported (or --check clean) · 1 the bundle is not trustworthy or the
 * pack is stale · 2 usage.
 *
 * From GraphCompose 2.3 this replaces regenerating with `extract-api.mjs`.
 * The difference is not convenience:
 *
 *   regenerating here  reads whatever the artifact happens to contain, with
 *                      this repository's copy of the generator, which can lag
 *                      the one upstream.
 *   importing          takes what GraphCompose's own CI gated against the
 *                      commit it describes — and brings routing and claims,
 *                      which this repository cannot produce at all.
 *
 * `extract-api.mjs` stays for lines at or before 2.2, which predate the bundle.
 *
 * The checksum is verified before anything is unpacked. A pack is the closed
 * set an agent authors against; installing one whose bytes were not checked
 * would make every downstream "this symbol does not exist" answer rest on an
 * unverified download.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { openJar } from "./lib/zip.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const PACKS = path.join(REPO_ROOT, "skills", "versions");

/** What a pack takes from a bundle. Guides and prose stay flow-owned. */
const IMPORTED = ["api/", "routing/", "claims/", "manifest.json", "provenance.json"];

function usage(code = 0) {
  process.stdout.write(
    "usage: node tools/api-surface/import-bundle.mjs --from <bundle.zip> [options]\n\n" +
      "  --from <zip>   the bundle, with its .sha256 beside it\n" +
      "  --sha256 <f>   checksum file, if it is not <zip>.sha256\n" +
      "  --pack <dir>   where to install (default: skills/versions/graphcompose-<line>)\n" +
      "  --check        verify the installed pack matches, instead of writing\n" +
      "  --no-verify    skip the checksum. Only for a bundle built locally,\n" +
      "                 never for one that arrived over a network\n\n" +
      "exit: 0 ok | 1 untrustworthy or stale | 2 usage\n",
  );
  process.exit(code);
}

const argv = process.argv.slice(2);
let from = null;
let sumFile = null;
let packDir = null;
let checkOnly = false;
let verify = true;
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === "--help" || a === "-h") usage(0);
  else if (a === "--from") from = argv[++i];
  else if (a === "--sha256") sumFile = argv[++i];
  else if (a === "--pack") packDir = argv[++i];
  else if (a === "--check") checkOnly = true;
  else if (a === "--no-verify") verify = false;
  else usage(2);
}
if (!from) usage(2);
if (!fs.existsSync(from)) {
  process.stderr.write(`[import-bundle] no such bundle: ${from}\n`);
  process.exit(1);
}

const archive = fs.readFileSync(from);
const digest = crypto.createHash("sha256").update(archive).digest("hex");

// --- is it what it says it is ------------------------------------------------

if (verify) {
  const expectedFile = sumFile ?? `${from}.sha256`;
  if (!fs.existsSync(expectedFile)) {
    process.stderr.write(
      `[import-bundle] no checksum at ${expectedFile}\n` +
        "  The release publishes one beside the archive. Pass --sha256 <file>, or\n" +
        "  --no-verify if you built this bundle yourself and it never left the machine.\n",
    );
    process.exit(1);
  }
  const expected = fs.readFileSync(expectedFile, "utf8").trim().split(/\s+/)[0];
  if (expected !== digest) {
    process.stderr.write(
      `[import-bundle] checksum mismatch for ${path.basename(from)}\n` +
        `  expected ${expected}\n  actual   ${digest}\n`,
    );
    process.exit(1);
  }
}

const bundle = openJar(from);

// The per-file digests inside the archive. The outer checksum has established
// the archive is intact; this says which entry is wrong when it is not.
const checksums = (() => {
  try {
    return JSON.parse(bundle.read("bundle-checksums.json").toString("utf8")).files ?? {};
  } catch {
    return {};
  }
})();

const corrupt = [];
for (const [name, expected] of Object.entries(checksums)) {
  if (!bundle.names.includes(name)) {
    corrupt.push(`${name} — listed in bundle-checksums.json but not in the archive`);
    continue;
  }
  const actual = crypto.createHash("sha256").update(bundle.read(name)).digest("hex");
  if (actual !== expected) corrupt.push(`${name} — content does not match its recorded digest`);
}
if (corrupt.length) {
  process.stderr.write(`[import-bundle] the archive is damaged:\n${corrupt.map((c) => `  ${c}\n`).join("")}`);
  process.exit(1);
}

const manifest = JSON.parse(bundle.read("manifest.json").toString("utf8"));
const provenance = (() => {
  try {
    return JSON.parse(bundle.read("provenance.json").toString("utf8"));
  } catch {
    return null;
  }
})();

const version = provenance?.version ?? manifest.targetVersion;
const line = version.replace(/-SNAPSHOT$/, "").split(".").slice(0, 2).join(".");
const target = packDir ?? path.join(PACKS, `graphcompose-${line}`);

// --- what gets installed -----------------------------------------------------

const wanted = bundle.names.filter((name) => IMPORTED.some((p) => (p.endsWith("/") ? name.startsWith(p) : name === p)));

const files = wanted.map((name) => [path.join(target, ...name.split("/")), bundle.read(name)]);

if (checkOnly) {
  const drift = files
    .filter(([file, contents]) => {
      if (!fs.existsSync(file)) return true;
      return !fs.readFileSync(file).equals(contents);
    })
    .map(([file]) => path.relative(REPO_ROOT, file));
  if (drift.length) {
    process.stdout.write(
      `[import-bundle] pack is behind the bundle: ${drift.slice(0, 5).join(", ")}` +
        `${drift.length > 5 ? ` … +${drift.length - 5}` : ""}\n` +
        `  reimport: node tools/api-surface/import-bundle.mjs --from ${from}\n`,
    );
    process.exit(1);
  }
  process.stdout.write(`[import-bundle] graphcompose-${line} matches ${path.basename(from)}\n`);
  process.exit(0);
}

for (const [file, contents] of files) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

// A record of where the pack came from, so a stale one can be traced to a
// release rather than guessed at. This is the field whose absence let a pack
// sit a patch version behind with nothing to notice.
fs.writeFileSync(
  path.join(target, "imported-from.json"),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      bundle: path.basename(from),
      sha256: digest,
      graphComposeVersion: version,
      generator: manifest.generator ?? null,
      generatorVersion: manifest.generatorVersion ?? null,
      sourceCommit: provenance?.git?.commit ?? null,
      sourceDirty: provenance?.git?.dirty ?? null,
      files: wanted,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

process.stdout.write(
  `[import-bundle] graphcompose-${line} <- ${path.basename(from)}\n` +
    `  GraphCompose ${version}${provenance?.git?.commit ? ` (${provenance.git.commit.slice(0, 8)}${provenance.git.dirty ? ", dirty" : ""})` : ""}\n` +
    `  ${wanted.length} files -> ${path.relative(REPO_ROOT, target)}\n` +
    `  provenance recorded in imported-from.json\n`,
);
