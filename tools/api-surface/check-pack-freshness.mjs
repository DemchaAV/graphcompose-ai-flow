#!/usr/bin/env node
/**
 * tools/api-surface/check-pack-freshness.mjs — is the newest pack still current?
 *
 *   node tools/api-surface/check-pack-freshness.mjs
 *   node tools/api-surface/check-pack-freshness.mjs --offline   # report, never fail
 *
 * Exit 0 current · 1 behind a published release · 2 usage.
 *
 * This exists because of a failure with no symptom. The 2.2 pack sat at 2.2.1
 * while 2.2.2 was on Maven Central, and nothing anywhere said so — a template
 * flow simply reported `GraphCompose version: 2.2.1` and carried on. Under the
 * closed-set rule that is not a cosmetic lag: the pack was missing five types
 * and thirty-five members, the whole layout-diagnostic snapshot API, so an agent
 * asked to use any of them would correctly conclude they did not exist.
 *
 * A stale allow-list is worse than an absent one. Absent, an agent knows it does
 * not know. Stale, it is confidently wrong, and the confidence comes from us.
 *
 * Only the **newest** pack line is checked. Older lines are frozen on purpose —
 * they describe releases that are themselves frozen, and re-checking them would
 * turn every historical pack into a permanent failure.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const PACKS = path.join(REPO_ROOT, "skills", "versions");
const METADATA =
  "https://repo.maven.apache.org/maven2/io/github/demchaav/graph-compose-core/maven-metadata.xml";

const argv = process.argv.slice(2);
if (argv.some((a) => a === "--help" || a === "-h")) {
  process.stdout.write(
    "usage: node tools/api-surface/check-pack-freshness.mjs [--offline]\n\n" +
      "  --offline   report what is known locally and exit 0\n\n" +
      "exit: 0 current | 1 behind a published release | 2 usage\n",
  );
  process.exit(0);
}
if (argv.some((a) => a !== "--offline")) process.exit(2);
const offline = argv.includes("--offline");

const compare = (a, b) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
};

// --- the newest pack ---------------------------------------------------------

const lines = fs
  .readdirSync(PACKS, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name.startsWith("graphcompose-"))
  .map((e) => e.name.slice("graphcompose-".length))
  .sort(compare);

const newest = lines[lines.length - 1];
const surface = path.join(PACKS, `graphcompose-${newest}`, "00-api-surface.md");
if (!fs.existsSync(surface)) {
  process.stderr.write(`[pack-freshness] no allow-list in the newest pack (graphcompose-${newest})\n`);
  process.exit(1);
}

const front = fs.readFileSync(surface, "utf8").slice(0, 2000);
const verifiedAgainst = front.match(/^verifiedAgainst:\s*(\S+)\s*$/m)?.[1] ?? null;
if (!verifiedAgainst) {
  process.stderr.write(
    `[pack-freshness] graphcompose-${newest}/00-api-surface.md has no verifiedAgainst front-matter —\n` +
      "  without it nothing can tell which release the pack describes.\n",
  );
  process.exit(1);
}

if (offline) {
  process.stdout.write(
    `[pack-freshness] graphcompose-${newest} describes ${verifiedAgainst} (not checked — offline)\n`,
  );
  process.exit(0);
}

// --- the newest release in that line ----------------------------------------

/**
 * Everything past the network call ends by *returning* a code, never by calling
 * `process.exit()`.
 *
 * `process.exit()` immediately after an `await fetch(...)` tears down the event
 * loop while libuv is still closing the request handle. On Windows that aborts
 * with `UV_HANDLE_CLOSING` and the shell sees **127** — which CI reads as a
 * missing command rather than as this check's verdict, so a real "your pack is
 * stale" would arrive looking like a broken script.
 */
async function main() {
  let metadata;
  try {
    const response = await fetch(METADATA);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    metadata = await response.text();
  } catch (error) {
    // A network failure is not a stale pack, and treating it as one would train
    // people to ignore this check on the day it is right.
    process.stdout.write(
      `[pack-freshness] could not reach Maven Central (${error.message}); ` +
        `graphcompose-${newest} describes ${verifiedAgainst}, unverified\n`,
    );
    return 0;
  }

  const published = [...metadata.matchAll(/<version>([^<]+)<\/version>/g)]
    .map((m) => m[1])
    .filter((v) => !v.includes("-") && v.startsWith(`${newest}.`))
    .sort(compare);

  const latest = published[published.length - 1];
  if (!latest) {
    process.stdout.write(
      `[pack-freshness] no published ${newest}.x release yet; pack describes ${verifiedAgainst}\n`,
    );
    return 0;
  }

  if (compare(verifiedAgainst, latest) >= 0) {
    process.stdout.write(
      `[pack-freshness] graphcompose-${newest} is current (${verifiedAgainst}, latest ${latest})\n`,
    );
    return 0;
  }

  process.stderr.write(
    `[pack-freshness] graphcompose-${newest} describes ${verifiedAgainst}, but ${latest} is published.\n\n` +
      "  The allow-list is a closed set: anything added in the newer release reads\n" +
      "  to an agent as API that does not exist, and it will refuse to call it.\n\n" +
      `    node tools/api-surface/extract-api.mjs --version ${latest}\n\n` +
      "  From GraphCompose 2.3 on, prefer importing the release's knowledge bundle:\n" +
      `    node tools/api-surface/import-bundle.mjs --from graph-compose-knowledge-${latest}.zip\n`,
  );
  return 1;
}

process.exitCode = await main();
