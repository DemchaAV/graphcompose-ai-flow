/**
 * scripts/lib/revision-seal.mjs — was this revision edited after it was judged?
 *
 * v0.10.0 stopped a correction from RENDERING into a revision that already
 * carried a review. In the first real run that hit it the gate worked and the
 * agent opened a new revision — and the record still came out damaged, because
 * the edit happens before the render:
 *
 *     revision-001  output.pdf                     20:37:32
 *                   visual-review.json             20:39:00
 *                   GeneratedProposalTemplate.java 20:50:54   <- eleven minutes later
 *
 * Nothing was lost: `new-revision` copies the body forward, so the correction
 * reached revision-002 and rendered there. What was lost is the meaning of
 * revision-001. Its template was never rendered and never reviewed, so rolling
 * back to it hands you code nobody checked — and the whole point of keeping
 * every revision is that you can go back to one.
 *
 * The seal is on the render; this is the seal on the revision. It is a
 * comparison of modification times, which is coarse but sufficient for the
 * question being asked: was a source file touched after the review that judged
 * it. A file copied forward by `new-revision` gets a fresh mtime and lands in a
 * revision that has no review yet, so the ordinary flow reports nothing.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Files whose content the review was about — the ones that produce the render.
 *
 * A generated test is not one of them: it exercises the template, it does not
 * compose the document, and editing it after the review changes nothing the
 * review looked at. Counting it would fire the seal on an ordinary act.
 */
const SOURCE = /\.java$|-data(\.[a-z0-9-]+)?\.json$/i;
const NOT_RENDERED = /test/i;

function modifiedAt(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * @param {string} revisionDir
 * @returns {{reviewed: boolean, broken: boolean, reviewedAt: number|null,
 *            edited: Array<{file: string, afterSeconds: number}>}}
 */
export function sealState(revisionDir) {
  const reviewedAt = modifiedAt(path.join(revisionDir, "visual-review.json"));
  if (reviewedAt === null) {
    // Nothing has judged this revision, so there is no seal to break.
    return { reviewed: false, broken: false, reviewedAt: null, edited: [] };
  }

  let names = [];
  try {
    names = fs.readdirSync(revisionDir);
  } catch {
    return { reviewed: true, broken: false, reviewedAt, edited: [] };
  }

  const edited = [];
  for (const name of names) {
    if (!SOURCE.test(name) || NOT_RENDERED.test(name)) continue;
    const at = modifiedAt(path.join(revisionDir, name));
    // A whole second of slack: the review is written moments after the source
    // it judges, and two files written in the same second are not evidence of
    // anything. Anything past that was a separate act.
    if (at !== null && at > reviewedAt + 1000) {
      edited.push({ file: name, afterSeconds: Math.round((at - reviewedAt) / 1000) });
    }
  }

  return { reviewed: true, broken: edited.length > 0, reviewedAt, edited };
}

/** One line naming what was touched and how long after, for a refusal or a reason. */
export function describeSeal(state) {
  if (!state.broken) return null;
  const worst = state.edited.reduce((a, b) => (b.afterSeconds > a.afterSeconds ? b : a));
  const others = state.edited.length > 1 ? ` (and ${state.edited.length - 1} more)` : "";
  return (
    `${worst.file} was modified ${worst.afterSeconds}s after the review that judged it${others} — ` +
    "this revision's source is no longer the source that was rendered and reviewed, " +
    "so it is not a state you can roll back to"
  );
}
