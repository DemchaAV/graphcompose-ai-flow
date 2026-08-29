#!/usr/bin/env node
/**
 * .github/scripts/release-notes.mjs — the release notes for a tag, from the
 * CHANGELOG section that tag names.
 *
 *   node .github/scripts/release-notes.mjs v0.20.0 [--out <file>]
 *
 * Prints the notes to stdout, and — when running under GitHub Actions — writes
 * `title` to `$GITHUB_OUTPUT` so the workflow can name the release.
 *
 * The notes are the section verbatim, and the section's first paragraph is meant
 * to be the "why update" line: a reader deciding whether to take a new version
 * needs a sentence about what changes for them, not a heading called "Fixed".
 *
 * The title is the annotated tag's own subject, not a heading and not something
 * typed at publish time. Both hand-made releases in this repository drifted from
 * their tag — v0.19.1's release is titled with v0.19.0's phrase — and a title
 * that is derived cannot.
 *
 * Exit codes: 0 wrote the notes | 1 no such section | 2 usage.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const argv = process.argv.slice(2);
const tag = argv.find((a) => !a.startsWith("--"));
const outIndex = argv.indexOf("--out");
const outFile = outIndex >= 0 ? argv[outIndex + 1] : null;

if (!tag) {
  process.stderr.write("usage: node .github/scripts/release-notes.mjs <tag> [--out <file>]\n");
  process.exit(2);
}

/** `v0.20.0` and `0.20.0` name the same section; the CHANGELOG writes it bare. */
const version = tag.replace(/^v/, "");

const changelog = fs.readFileSync(path.join(repoRoot, "CHANGELOG.md"), "utf8");
const section = sectionFor(changelog, version);

if (!section) {
  process.stderr.write(
    `[release-notes] CHANGELOG.md has no "## v${version}" section. ` +
      "A tag whose notes cannot be found is a release nobody can read: add the section, " +
      "then re-run this workflow for the tag.\n",
  );
  process.exit(1);
}

const notes = section.body.trim() + "\n";
process.stdout.write(notes);
if (outFile) fs.writeFileSync(outFile, notes, "utf8");

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `title=${titleFor(tag, section)}\n`, "utf8");
}

/**
 * The release title: the annotated tag's subject.
 *
 * <p>Falls back to the CHANGELOG heading with its date stripped, which is what a
 * lightweight tag leaves us. Never throws — a missing title is not a reason to
 * publish no notes.</p>
 */
function titleFor(tagName, section) {
  try {
    const subject = execFileSync(
      "git",
      ["tag", "-l", "--format=%(contents:subject)", tagName],
      { cwd: repoRoot, encoding: "utf8" },
    ).trim();
    if (subject) return subject;
  } catch {
    /* not a git checkout, or no such tag */
  }
  return section.title;
}

/**
 * The `## vX.Y.Z` section, from its heading to the next `## ` heading.
 *
 * @param {string} text CHANGELOG.md
 * @param {string} version without the leading `v`
 * @returns {{title: string, body: string}|null}
 */
function sectionFor(text, version) {
  const lines = text.split(/\r?\n/);
  const heading = new RegExp(`^##\\s+v${version.replace(/\./g, "\\.")}(\\s|$)`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start < 0) return null;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i;
      break;
    }
  }

  return {
    // Without the date: GitHub shows one beside the release already.
    title: lines[start].replace(/^##\s+/, "").replace(/\s+—\s+\d{4}-\d{2}-\d{2}\s*$/, ""),
    body: lines.slice(start + 1, end).join("\n"),
  };
}
