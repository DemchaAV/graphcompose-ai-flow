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
 * Only the **newest** pack is checked. Older lines are frozen on purpose — they
 * describe releases that are themselves frozen, and re-checking them would turn
 * every historical pack into a permanent failure.
 *
 * What it is checked *against* is every published release, not just its own
 * line. Comparing only within the line is how GraphCompose 2.3.0 shipped and
 * this gate went on reporting the 2.2 pack "current": the one event worth
 * catching, a release nothing here has a pack for, was the one it could not
 * see. The two are reported apart — a newer patch means repair this pack, a
 * newer line means there is no pack yet — because the remedy differs.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { noAllowListHint, packLayout, packVerifiedAgainst } from "../../scripts/lib/pack-surface.mjs";
import { compareVersions, releaseFreshness } from "../../scripts/lib/release-freshness.mjs";

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

// --- the newest pack ---------------------------------------------------------

const lines = fs
  .readdirSync(PACKS, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name.startsWith("graphcompose-"))
  .map((e) => e.name.slice("graphcompose-".length))
  .sort(compareVersions);

const newest = lines[lines.length - 1];
const newestDir = path.join(PACKS, `graphcompose-${newest}`);

// Whichever layout the newest pack is in. This read the Markdown front-matter
// directly, and importing a knowledge bundle — which has no such file, the API
// being split per surface — turned the freshness gate off with a message about
// a missing allow-list. A gate that goes quiet when the thing it watches gets
// newer is worse than no gate: nothing was stale, and nothing was checked.
if (packLayout(newestDir) === "none") {
  process.stderr.write(`[pack-freshness] ${noAllowListHint(`graphcompose-${newest}`)}`);
  process.exit(1);
}

const verifiedAgainst = packVerifiedAgainst(newestDir);
if (!verifiedAgainst) {
  process.stderr.write(
    `[pack-freshness] graphcompose-${newest} does not say which release it describes —\n` +
      "  no verifiedAgainst in its surfaces, and no imported-from.json from a bundle.\n",
  );
  process.exit(1);
}

if (offline) {
  process.stdout.write(
    `[pack-freshness] graphcompose-${newest} describes ${verifiedAgainst} (not checked — offline)\n`,
  );
  process.exit(0);
}

// --- against what has been published ----------------------------------------

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

  const { status, latestInLine, latestPublished } = releaseFreshness({
    line: newest,
    verifiedAgainst,
    published: [...metadata.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]),
  });

  if (status === "unreleased-line") {
    process.stdout.write(
      `[pack-freshness] no published ${newest}.x release yet; pack describes ${verifiedAgainst}\n`,
    );
    return 0;
  }

  if (status === "current") {
    process.stdout.write(
      `[pack-freshness] graphcompose-${newest} is current (${verifiedAgainst}, latest ${latestPublished})\n`,
    );
    return 0;
  }

  if (status === "behind-in-line") {
    process.stderr.write(
      `[pack-freshness] graphcompose-${newest} describes ${verifiedAgainst}, but ${latestInLine} is published.\n\n` +
        "  The allow-list is a closed set: anything added in the newer release reads\n" +
        "  to an agent as API that does not exist, and it will refuse to call it.\n\n" +
        `    node tools/api-surface/extract-api.mjs --version ${latestInLine}\n\n` +
        "  From GraphCompose 2.3 on, prefer importing the release's knowledge bundle:\n" +
        `    node tools/api-surface/import-bundle.mjs --from graph-compose-knowledge-${latestInLine}.zip\n`,
    );
    return 1;
  }

  // A whole new line. The pack is not wrong — graphcompose-<newest> describes
  // its own line correctly — so the fix is a pack that does not exist yet, not
  // a repair to one that does. This is the case the gate used to miss entirely:
  // filtering the published list to the newest pack's line meant a new minor
  // was invisible, and the gate reported "current" while the harness had no
  // pack for the release that had actually shipped.
  process.stderr.write(
    `[pack-freshness] GraphCompose ${latestPublished} is published and no pack describes it.\n` +
      `  graphcompose-${newest} is current for its own line (${verifiedAgainst}), which is why\n` +
      "  nothing here is stale — and why nothing here can answer for the new one.\n\n" +
      "  Import the release's knowledge bundle; it creates the pack:\n" +
      `    node tools/api-surface/import-bundle.mjs --from graph-compose-knowledge-${latestPublished}.zip\n`,
  );
  return 1;
}

process.exitCode = await main();
