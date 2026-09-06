/**
 * scripts/lib/template-origin.mjs — was this template authored for this analysis?
 *
 * ## Why
 *
 * `visual-analysis.json` is now bound to the reference it describes, and an
 * imported one is refused. The next run routed around that: it wrote a genuine
 * new analysis — measured containers and all, because the schema made it — and
 * then copied `generated-template.java` byte for byte out of a different
 * project's revision. The measurements were made and reached no code. The diff
 * came out at 13.9810% in both projects, to four decimal places, because it was
 * the same Java rendering the same data.
 *
 * A template is edited on every correction pass, so it cannot be pushed through
 * a committing tool the way a discovery artifact is — the loop would pay a
 * commit per edit. What it can be is *recognised*: a template identical to one
 * sitting in another project of the same workspace was not written from this
 * project's analysis, whatever else is true about it.
 *
 * ## What this does and does not catch
 *
 * Catches: a copy from another project in the same workspace — the observed
 * case, and the cheap one, because those files are already on disk beside us.
 *
 * Does not catch: a copy from another workspace, or one edited after copying.
 * The check is content identity, and it claims nothing beyond that. It is a
 * tripwire on the shortcut somebody actually took, not a proof of authorship.
 *
 * Deliberately NOT flagged: another revision of the SAME project. `pass.mjs`
 * carries a parent's template into the next revision, which is the loop
 * working, and a pass that changed nothing is already reported by attempts.
 *
 * Nor is the ORIGINAL flagged. Identity is symmetric — once a copy exists, each
 * file is the other's twin — so the older revision would be accused of copying
 * from the newer one, and the project that did nothing wrong would be the one
 * that could not render. Only a twin in a revision created BEFORE this one
 * counts, read from `revision.json`'s own `createdAt` rather than from file
 * timestamps, which a copy rewrites.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const TEMPLATE = /^(?:[A-Z][A-Za-z0-9]*Template|generated-template)\.java$/;

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/**
 * Find an identical template in a different project of the same workspace.
 *
 * @param {{workspaceRoot: string, projectId: string, templateFile: string}} input
 * @returns {{project: string, revision: string, file: string}|null}
 */
export function findForeignTwin({ workspaceRoot, projectId, templateFile, revisionDir = null }) {
  if (!templateFile || !fs.existsSync(templateFile)) return null;
  const projectsDir = path.join(workspaceRoot, "projects");
  if (!fs.existsSync(projectsDir)) return null;

  // When this revision was opened. A twin from a revision opened later is a
  // copy OF us, not one we made; that project's own render is where it gets
  // reported. Unknown means we cannot order them, and an unordered pair is
  // still worth reporting — a copy nobody can date is still a copy.
  const mineAt = revisionOpenedAt(revisionDir ?? path.dirname(templateFile));

  // Size first: reading every template in the workspace to compare hashes is
  // work proportional to the corpus, and a byte-identical copy has an identical
  // size. Only same-size candidates are hashed.
  const size = fs.statSync(templateFile).size;
  let mine = null;

  for (const project of safeReaddir(projectsDir)) {
    if (project === projectId) continue;
    const revisions = path.join(projectsDir, project, "revisions");
    for (const revision of safeReaddir(revisions)) {
      for (const name of safeReaddir(path.join(revisions, revision))) {
        if (!TEMPLATE.test(name)) continue;
        const candidate = path.join(revisions, revision, name);
        let stat;
        try {
          stat = fs.statSync(candidate);
        } catch {
          continue;
        }
        if (!stat.isFile() || stat.size !== size) continue;
        // Only a twin that already existed when this revision was opened.
        const theirsAt = revisionOpenedAt(path.join(revisions, revision));
        if (mineAt !== null && theirsAt !== null && theirsAt > mineAt) continue;
        mine ??= sha256(templateFile);
        try {
          if (sha256(candidate) === mine) return { project, revision, file: candidate };
        } catch {
          /* unreadable candidate proves nothing */
        }
      }
    }
  }
  return null;
}

/** The sentence a barrier prints when {@link findForeignTwin} finds one. */
export function describeForeignTwin(twin) {
  return (
    `this template is byte-identical to ${twin.project}/${twin.revision} — it was copied, not ` +
    "written from this project's analysis, so the geometry that analysis measured reached no " +
    "code. Author the template against visual-analysis.json; if you meant to start from a " +
    "published template, that is node scripts/use-template.mjs, which is a different thing"
  );
}

/** When a revision was opened, from its own record. null when unreadable. */
function revisionOpenedAt(revisionDir) {
  try {
    const at = JSON.parse(fs.readFileSync(path.join(revisionDir, "revision.json"), "utf8")).createdAt;
    const ms = Date.parse(at);
    return Number.isFinite(ms) ? ms : null;
  } catch {
    return null;
  }
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}
