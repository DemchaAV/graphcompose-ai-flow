#!/usr/bin/env node
/**
 * sync-engine-guides.mjs — vendor the GraphCompose "how to use the engine"
 * developer guides into this flow.
 *
 * The guides are the verified how-to layer of the GraphCompose private LLM
 * wiki (`.llm-wiki/12-docs-extraction/`): one guide per real developer
 * question, intent-first, compile-smoke + render-proven upstream. They are the
 * usage counterpart to the source-generated allow-list (00-api-surface.md):
 * the allow-list says WHAT exists, the guides say HOW to use it.
 *
 * Unlike the allow-list, the guides are CURATED, not regenerated from a tag —
 * so this is a re-sync (copy + stamp), not a `--src` generation. Each guide is
 * copied verbatim with a provenance front-matter block prepended so the
 * vendored copy records where it came from and which release it is pinned to.
 * The flow-owned index (00-index.md) is NOT overwritten.
 *
 *   node tools/api-surface/sync-engine-guides.mjs \
 *     --src "C:/Dev/Java/GraphCompose/.llm-wiki/12-docs-extraction" \
 *     --out skills/versions/graphcompose-1.9/guides \
 *     --verified 1.9.0
 *
 * --src defaults to "$GRAPHCOMPOSE_WIKI/12-docs-extraction" when the
 * GRAPHCOMPOSE_WIKI env var is set, else to the maintainer's local checkout.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const defaultWiki = process.env.GRAPHCOMPOSE_WIKI
  ? path.join(process.env.GRAPHCOMPOSE_WIKI, "12-docs-extraction")
  : "C:/Dev/Java/GraphCompose/.llm-wiki/12-docs-extraction";

const src = path.resolve(arg("src", defaultWiki));
const out = path.resolve(repoRoot, arg("out", "skills/versions/graphcompose-1.9/guides"));
const verified = arg("verified", "1.9.0");

if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
  console.error(
    `[sync-engine-guides] source not found: ${src}\n` +
      `Pass --src <path to .llm-wiki/12-docs-extraction> or set GRAPHCOMPOSE_WIKI.`,
  );
  process.exit(1);
}

fs.mkdirSync(out, { recursive: true });

// Numbered guides only; the flow owns 00-index.md, so never overwrite it.
const guides = fs
  .readdirSync(src)
  .filter((f) => /^\d{2}-.+\.md$/.test(f) && f !== "00-index.md")
  .sort();

if (guides.length === 0) {
  console.error(`[sync-engine-guides] no NN-*.md guides found under ${src}`);
  process.exit(1);
}

function provenance(fileName) {
  return (
    "---\n" +
    `vendoredFrom: "GraphCompose .llm-wiki/12-docs-extraction/${fileName}"\n` +
    `verifiedAgainst: "${verified}"\n` +
    'syncedBy: "tools/api-surface/sync-engine-guides.mjs"\n' +
    'note: "Verified how-to guide vendored from the GraphCompose LLM wiki ' +
    '(compile-smoke + render-proven upstream). Re-sync per release; do not hand-edit the body."\n' +
    "---\n\n"
  );
}

let written = 0;
for (const f of guides) {
  const body = fs.readFileSync(path.join(src, f), "utf8");
  fs.writeFileSync(path.join(out, f), provenance(f) + body, "utf8");
  written += 1;
}

console.log(
  `[sync-engine-guides] vendored ${written} guide(s) -> ${path.relative(repoRoot, out)} ` +
    `(verifiedAgainst ${verified})`,
);
console.log(`[sync-engine-guides] index (00-index.md) is flow-owned and left untouched.`);
