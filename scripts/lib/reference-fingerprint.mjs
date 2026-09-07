/**
 * scripts/lib/reference-fingerprint.mjs — which reference was this analysis of?
 *
 * ## Why
 *
 * `visual-analysis.json` is the one artifact nothing could tie to the thing it
 * describes. The barrier asks whether it validates; validating says the
 * document is well-shaped, not that anybody looked at *this* reference.
 *
 * A real run made that concrete. An agent asked to build a template from a new
 * reference opened a fresh project, then copied `revisions/revision-001/*` and
 * `render-runner/` wholesale from an older project of the same name. The
 * `visual-analysis.json` that landed was byte-identical to the older run's.
 * Discovery never executed, the barrier passed, and four revisions were spent
 * correcting a template built from an analysis of a different run's work.
 *
 * ## Why the reference hash alone is not enough
 *
 * In that run the two references were also byte-identical — the same image
 * imported into both projects — and both projects carried the same id,
 * `nora-bennett-cv`. A fingerprint over the image, or over the image and the
 * project id, would have said "correct reference" and waved the import
 * through. What actually differed was the workspace: `TestHarness` and
 * `agy-harness`.
 *
 * So the fingerprint binds three things, and any one of them differing is a
 * different analysis: the reference bytes, the project id, and the workspace
 * the project lives in. The third is the one that costs something — moving a
 * Java project invalidates its analyses — and it is worth it: a re-stamp is one
 * command, while a silently imported analysis cost four revisions correcting a
 * template built from a document nobody had produced for it. Its mismatch gets
 * its own message so a move never reads as a theft.
 *
 * Revision is deliberately NOT part of it. `pass.mjs` carries a parent's
 * sources into the next revision, which is the loop working as intended; a
 * fingerprint that changed per revision would call every second pass invalid.
 *
 * ## Why the tool stamps it and the model never writes it
 *
 * A value the model writes is a value a copying agent copies. This is computed
 * from disk by `write-artifact.mjs` at the moment the artifact becomes
 * canonical — the only sanctioned way in — and whatever the document arrived
 * with is replaced. `check-analysis` then recomputes from disk and compares, so
 * a file that came from somewhere else carries provenance that no longer
 * matches where it now sits.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** The reference page images, in page order. `source.png` is the pre-conversion
 *  original and is excluded: re-importing the same page from a different source
 *  file is not a different reference. */
export function referencePages(projectDir) {
  const dir = path.join(projectDir, "reference");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^reference.*\.png$/i.test(f))
    .sort();
}

/**
 * The fingerprint of what is on disk right now.
 *
 * @param {{projectDir: string, projectId: string}} input
 * @returns {{project: string, reference: {sha256: string, pages: string[], bytes: number}}|null}
 *          null when the project carries no reference to fingerprint
 */
export function computeFingerprint({ projectDir, projectId }) {
  const pages = referencePages(projectDir);
  if (pages.length === 0) return null;

  // One digest over every page, each page's name folded in with its bytes so
  // that reordering or renaming pages is a different fingerprint rather than
  // the same one.
  const digest = crypto.createHash("sha256");
  let bytes = 0;
  for (const page of pages) {
    const buf = fs.readFileSync(path.join(projectDir, "reference", page));
    digest.update(page);
    digest.update(buf);
    bytes += buf.length;
  }
  return {
    project: onDiskProjectId(projectDir, projectId),
    workspace: workspaceId(projectDir),
    reference: { sha256: digest.digest("hex"), pages, bytes },
  };
}

/**
 * What the filesystem calls this project, rather than what the user typed.
 *
 * `--project Nora-Bennett-CV` opens `projects/nora-bennett-cv` on Windows and
 * macOS without complaint, so the id reaching this module is whatever casing
 * the command carried. Stamping that and comparing it later against a
 * differently-typed run of the same project reported `foreign-project` — "run
 * the analysis against this reference instead" — for an analysis written from
 * this project's own reference minutes earlier.
 *
 * `realpathSync.native` answers with the name on disk, so both runs stamp and
 * check the same string. Deliberately not a `toLowerCase()`: on a
 * case-sensitive filesystem `Nora` and `nora` are two projects, and folding
 * them together would let one's analysis pass the other's barrier — the exact
 * import this module exists to catch. The fallback is the typed id, because a
 * project directory that cannot be resolved is a problem for the caller, not a
 * reason to refuse a fingerprint.
 */
function onDiskProjectId(projectDir, projectId) {
  try {
    return path.basename(fs.realpathSync.native(projectDir));
  } catch {
    return projectId;
  }
}

/**
 * A digest of where the project lives, so two projects with the same id and the
 * same reference in two different workspaces are still two different analyses.
 * Hashed rather than stored, because the absolute path is the user's directory
 * layout and belongs in nobody's committed artifact. Normalised and lowercased:
 * Windows gives the same directory back with different casing and separators
 * depending on who asked.
 */
export function workspaceId(projectDir) {
  const root = path.resolve(projectDir, "..", "..");
  const normalised = root.split(path.sep).join("/").toLowerCase();
  return crypto.createHash("sha256").update(normalised).digest("hex").slice(0, 32);
}

/**
 * Does a recorded provenance still describe where it sits?
 *
 * @param {object|null|undefined} recorded  the artifact's `provenance` block
 * @param {object|null} actual              {@link computeFingerprint} of the project
 * @returns {{ok: boolean, reason: string|null, kind: string|null}}
 */
export function compareFingerprint(recorded, actual) {
  if (!actual) {
    // Nothing to compare against. Not the artifact's fault, and not a pass
    // either — say which it is so the caller can decide.
    return { ok: true, reason: null, kind: "no-reference" };
  }
  if (!recorded || typeof recorded !== "object") {
    return {
      ok: false,
      kind: "missing",
      reason:
        "carries no provenance, so nothing ties it to this project's reference. Written before " +
        "provenance existed, or written by something other than write-artifact.mjs. Re-commit it: " +
        "node scripts/write-artifact.mjs --project <id> --artifact visual-analysis.json --from <the file>",
    };
  }
  if (recorded.project !== actual.project) {
    return {
      ok: false,
      kind: "foreign-project",
      reason:
        `was written for project "${recorded.project}" and now sits in "${actual.project}" — ` +
        "discovery has not run for this project. Copying another project's analysis skips phase 2 " +
        "while appearing to pass its barrier; run the analysis against this reference instead",
    };
  }
  if (recorded.workspace !== actual.workspace) {
    return {
      ok: false,
      kind: "foreign-workspace",
      reason:
        "was written for a project of this name in a DIFFERENT workspace. Two things do this. " +
        "If the analysis was copied in from another workspace, discovery has not run here — run it " +
        "against this reference. If you moved or renamed the project's Java tree, the analysis is " +
        "fine and only its stamp is stale: re-commit it with " +
        "node scripts/write-artifact.mjs --project <id> --artifact visual-analysis.json --from <the file>",
    };
  }
  if (recorded.reference?.sha256 !== actual.reference.sha256) {
    return {
      ok: false,
      kind: "foreign-reference",
      reason:
        `describes a reference with sha256 ${short(recorded.reference?.sha256)} and this project's ` +
        `reference is ${short(actual.reference.sha256)} — the analysis is of a different image. ` +
        "Re-run discovery against the reference now on disk",
    };
  }
  return { ok: true, reason: null, kind: "match" };
}

function short(sha) {
  return typeof sha === "string" && sha.length > 12 ? `${sha.slice(0, 12)}…` : String(sha ?? "none");
}
