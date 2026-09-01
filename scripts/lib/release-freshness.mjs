/**
 * scripts/lib/release-freshness.mjs — is the newest pack behind the library?
 *
 * ## Why this is its own file
 *
 * The freshness gate asks Maven Central what has been published and compares it
 * with what the newest pack describes. The fetching is untestable without a
 * network; the comparison is where the judgement lives, and it had a bug that
 * survived precisely because the two were the same function.
 *
 * That bug: the published list was filtered to the newest pack's own line
 * before anything was compared. With a 2.2 pack the gate could see 2.2.0,
 * 2.2.1, 2.2.2 and nothing else — so when GraphCompose 2.3.0 shipped it
 * reported "current" and went on reporting it. The one event the gate exists to
 * catch, a release the harness has no pack for, was the one event it could not
 * see. It was written for the patch case (a 2.2 pack sitting at 2.2.1 against a
 * published 2.2.2) and the whole-new-line case was never considered.
 *
 * ## Why the line filter was there, and why it stays in part
 *
 * Not an accident: a pack line is frozen on purpose. `graphcompose-1.9`
 * describing 1.9 is a correct record of a release that is itself finished, and
 * re-checking it against every later version would turn every historical pack
 * into a permanent failure.
 *
 * So the two staleness kinds are kept apart, because the fix differs:
 *
 *   `behind-in-line`   a newer patch of the same line. The existing pack is
 *                      wrong and is regenerated or re-imported in place.
 *   `line-behind`      a newer minor or major has shipped. The existing pack is
 *                      not wrong — it correctly describes its line — and the
 *                      remedy is a new pack, not a repaired one.
 *
 * Both are the gate firing. Saying which one it is decides what the reader does
 * next, and the second used to be silence.
 */

/**
 * Numeric version comparison, component by component. Missing components read
 * as zero, so `2.3` and `2.3.0` are the same version.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} negative when a < b, 0 when equal, positive when a > b
 */
export function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * What the newest pack's state is against what has been published.
 *
 * @param {object} input
 * @param {string} input.line             the newest pack's line, e.g. "2.2"
 * @param {string} input.verifiedAgainst  the release that pack describes
 * @param {string[]} input.published      every published version, any order;
 *                                        pre-releases are filtered out here
 * @returns {{status: string, latestInLine: string|null, latestPublished: string|null}}
 *   status is one of `current`, `behind-in-line`, `line-behind`, `unreleased-line`
 */
export function releaseFreshness({ line, verifiedAgainst, published }) {
  const releases = published.filter((v) => !v.includes("-")).sort(compareVersions);
  const inLine = releases.filter((v) => v.startsWith(`${line}.`));
  const latestInLine = inLine[inLine.length - 1] ?? null;
  const latestPublished = releases[releases.length - 1] ?? null;

  // A pack for a line Maven Central has never seen is ahead, not behind: this
  // is how a pack is built against a snapshot before its release exists, and
  // failing it would make the gate fire on the day someone does the right thing.
  if (!latestInLine) return { status: "unreleased-line", latestInLine, latestPublished };

  if (compareVersions(verifiedAgainst, latestInLine) < 0) {
    return { status: "behind-in-line", latestInLine, latestPublished };
  }

  // Current for its own line — and that is exactly the state in which a whole
  // new line goes unnoticed, because the pack it would need does not exist yet
  // and so is not the newest pack on disk.
  if (latestPublished && compareVersions(latestPublished, verifiedAgainst) > 0) {
    return { status: "line-behind", latestInLine, latestPublished };
  }

  return { status: "current", latestInLine, latestPublished };
}
