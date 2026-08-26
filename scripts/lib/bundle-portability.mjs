/**
 * scripts/lib/bundle-portability.mjs — would this bundle work on someone else's
 * machine?
 *
 * A published bundle is the one artifact that leaves this harness. Everything
 * else — revisions, workspaces, the flow directory — is scaffolding the
 * consumer never sees and cannot recreate. So a path into that scaffolding, or
 * an absolute path from the machine that published, is not a cosmetic problem:
 * it is a bundle that resolves on exactly one computer, and it fails at render
 * with a message about a missing file rather than about a bad publish.
 *
 * The failure mode this exists for is quiet. `templates/<id>/` looks complete,
 * it compiles, the manifest parses, and the first consumer to run it gets
 * "No icon resolved for token" pointing at `C:\Dev\projects\...`.
 *
 * Two severities, and the difference matters:
 *
 *   blocking   the bundle does not work elsewhere. Publishing fails.
 *   known      a leak that is real, scheduled, and not yet fixable without
 *              breaking every bundle already published. Reported on every
 *              publish so it cannot be forgotten; does not fail.
 *
 * There is exactly one `known` rule today — `graphcompose.revision.dir`, the
 * property published providers read. Renaming it is its own piece of work
 * (a consumer-facing API change with a back-compatible reader), and failing
 * publishes over it in the meantime would stop the harness rather than improve
 * a bundle.
 */

import fs from "node:fs";
import path from "node:path";

/** Text files worth reading. Anything else is an asset, and bytes cannot leak a path. */
const TEXT = /\.(java|md|json|xml|txt|properties|gradle|kts|ya?ml|cfg|ini)$/i;

/**
 * The rules, in the order a reader should see them.
 *
 * `allowIn` names the files where a match is legitimate rather than a defect.
 * Revision vocabulary is allowed in the manifest and the README because item 82
 * of the consumer contract keeps it there deliberately: `sourceRevision` is how
 * a rendering service logs which template produced a document. It is metadata.
 * The same word inside a `.java` file is not metadata — it is code that knows
 * about a revision, which is the thing that must not survive publishing.
 */
const RULES = [
  {
    id: "absolute-path",
    severity: "blocking",
    pattern: /(?:^|[\s"'(<=])(?:[A-Za-z]:[\\/]|\/(?:home|Users)\/)/,
    message: "carries an absolute path, which resolves only where this was published",
  },
  {
    id: "workspace-path",
    severity: "blocking",
    pattern: /graphcompose-flow[\\/]/,
    message: "points into a graphcompose-flow workspace, which a consumer does not have",
  },
  {
    id: "revision-path",
    severity: "blocking",
    pattern: /revisions[\\/][\w.-]+/,
    message: "points into a revisions/ directory, which exists only inside the harness",
  },
  {
    id: "revision-vocabulary",
    severity: "blocking",
    allowIn: ["template.json", "README.md"],
    pattern: /\brevision-\d+\b/,
    message: "names a revision, which is harness vocabulary and means nothing to a consumer",
  },
  {
    id: "harness-property",
    severity: "known",
    pattern: /graphcompose\.revision\.dir/,
    message:
      "reads the harness's own property name. Published code should read " +
      "graphcompose.template.dir, or take its paths explicitly; every bundle " +
      "published so far reads this one, so renaming it is a separate change",
  },
];

/**
 * Every portability problem in a bundle directory.
 *
 * @param {string} root the bundle directory
 * @param {{skip?: string[]}} [options] rule ids to leave out entirely — for a
 *        caller that has already reported them by another route, never as a way
 *        to make a finding go away
 * @returns {Array<{rule: string, severity: string, file: string, line: number,
 *                  text: string, message: string}>}
 */
export function scanPortability(root, { skip = [] } = {}) {
  const findings = [];
  const rules = RULES.filter((rule) => !skip.includes(rule.id));

  for (const file of walkFiles(root)) {
    if (!TEXT.test(file)) continue;
    const rel = path.relative(root, file).split(path.sep).join("/");
    const base = path.basename(file);
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);

    lines.forEach((text, index) => {
      for (const rule of rules) {
        if (rule.allowIn?.includes(base)) continue;
        if (!rule.pattern.test(text)) continue;
        findings.push({
          rule: rule.id,
          severity: rule.severity,
          file: rel,
          line: index + 1,
          text: text.trim().slice(0, 160),
          message: rule.message,
        });
      }
    });
  }
  return findings;
}

/** The findings that must stop a publish. */
export function blocking(findings) {
  return findings.filter((f) => f.severity === "blocking");
}

/** The findings that are real, scheduled, and reported without stopping anything. */
export function known(findings) {
  return findings.filter((f) => f.severity === "known");
}

/** One finding, as a line a reader can act on. */
export function formatFinding(finding) {
  return `${finding.file}:${finding.line} ${finding.message}\n      ${finding.text}`;
}

function* walkFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full);
    else if (entry.isFile()) yield full;
  }
}
