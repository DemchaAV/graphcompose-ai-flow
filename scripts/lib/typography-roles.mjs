/**
 * scripts/lib/typography-roles.mjs — which face is that, and did anyone measure it?
 *
 * ## The failure
 *
 * Three runs on one reference came back with all twelve regions CRITICAL and a
 * spread of only 13–22%. A uniform miss like that is not a few broken widgets;
 * the largest single cause was the heading face. The reference sets its
 * section headings in a bold grotesque, and every one of the three renders set
 * them in a serif.
 *
 * Nobody chose wrong on purpose. `typography` in the analysis schema is seven
 * free strings with `required: []`, and the one the author actually reads is
 * `likelyFontFamily` — in the run that prompted this, "Poppins for body and a
 * classic serif such as Spectral or Tinos for display text". A guess, written
 * where a measurement belongs, and read downstream as though it were one.
 *
 * `scripts/typography.mjs match` has ranked families against a crop of the
 * reference since before any of those runs. None of the three called it: the
 * loop reference offers it, and nothing requires it.
 *
 * ## What this module decides
 *
 * A role is measured or assumed, and it has to say which. Measured means a
 * recorded `typography.mjs match` put the chosen family near the top of its
 * ranking for that role. Assumed means someone chose it and said why — which
 * is a legitimate answer, because a face with no bundled equivalent is a real
 * outcome. The difference between the two is exactly what the old schema could
 * not express, so both arrived looking identical.
 *
 * ## Why the rank window is loose
 *
 * The matcher separates a grotesque from a serif easily and Barlow from Fira
 * Sans barely — it reports `separation` for that reason. Demanding rank 1 would
 * reject a correct choice over a difference the measurement itself calls noise.
 * Rank 3 is wide enough to survive that and still narrow enough to have caught
 * every miss described above, all of which put a serif against a grotesque.
 *
 * Pure by design: the caller reads `typography-match.json` off disk and hands
 * it in, so the tests run off literals with no files, the way `fill-probe.mjs`
 * runs off synthesised rasters.
 */

/** The type roles a page can name. A document need not use all of them. */
export const ROLES = Object.freeze(["title", "headings", "body", "meta", "table"]);

/**
 * The two that set the page.
 *
 * Body is most of the ink and headings are the most recognisable shape, so
 * between them they carry the document's whole typographic impression — which
 * is why getting headings wrong showed up in every region, including regions
 * that contain no heading at all. A document with one family names it twice;
 * that costs a line and keeps the contract honest.
 */
export const REQUIRED_ROLES = Object.freeze(["headings", "body"]);

/** How far down a ranking a measured choice may sit. See the note above. */
export const TOP_N = 3;

/** Where `fontName` placed in this match's ranking, or null if it is absent. */
export function rankOf(match, fontName) {
  if (!match || !Array.isArray(match.ranked) || typeof fontName !== "string") return null;
  const wanted = fontName.trim().toUpperCase();
  for (const entry of match.ranked) {
    if (typeof entry?.family === "string" && entry.family.toUpperCase() === wanted) {
      return typeof entry.rank === "number" ? entry.rank : null;
    }
  }
  return null;
}

/** The family the ranking put first, for a message that names the alternative. */
function winnerOf(match) {
  const first = (match?.ranked ?? []).find((e) => e?.rank === 1) ?? match?.ranked?.[0];
  return typeof first?.family === "string" ? first.family : null;
}

/**
 * Hold the analysis when a type role is unmeasured, unexplained, or contradicted.
 *
 * @param {object} input
 * @param {object|null|undefined} input.typography the analysis's `typography`
 * @param {Array<object>} input.matches recorded matches, `typography-match.json`'s `matches`
 * @returns {{held: string[], measured: number, assumed: number, declared: number}}
 */
export function auditTypography({ typography, matches = [] }) {
  const roles = Array.isArray(typography?.roles) ? typography.roles : [];
  const held = [];

  if (roles.length === 0) {
    return {
      held: [
        "typography.roles is empty — a face nobody named is a face nobody measured, " +
          `and ${REQUIRED_ROLES.join(" and ")} set the whole page`,
      ],
      measured: 0,
      assumed: 0,
      declared: 0,
    };
  }

  const seen = new Map();
  for (const role of roles) {
    if (!role?.role) continue;
    if (seen.has(role.role)) held.push(`"${role.role}" is declared twice — one role resolves to one face`);
    seen.set(role.role, role);
  }

  for (const required of REQUIRED_ROLES) {
    if (!seen.has(required)) held.push(`no "${required}" role — it is one of the two that set the page`);
  }

  let measured = 0;
  let assumed = 0;
  for (const [name, role] of seen) {
    if (role.source === "assumed") {
      assumed += 1;
      // The schema can require the field; only here can the message say what it
      // is for — an assumption that gives no reason cannot be reviewed later.
      if (!role.why || !String(role.why).trim()) {
        held.push(`"${name}" is assumed and says no why — an assumption nobody can review is a guess`);
      }
      continue;
    }

    measured += 1;
    const match = matches.find((m) => m?.role === name);
    if (!match) {
      held.push(
        `"${name}" claims to be measured and no match was recorded for it — ` +
          `run: node scripts/typography.mjs match --role ${name} --reference <crop.png> --text "<the exact string>"`,
      );
      continue;
    }

    const rank = rankOf(match, role.fontName);
    if (rank === null) {
      held.push(
        `"${name}" uses ${role.fontName}, which the recorded match for it never ranked` +
          (winnerOf(match) ? ` — it ranked ${winnerOf(match)} first` : ""),
      );
      continue;
    }
    if (rank > TOP_N) {
      held.push(
        `"${name}" uses ${role.fontName}, which the reference crop ranked ${rank} of ` +
          `${match.ranked.length}${winnerOf(match) ? ` behind ${winnerOf(match)}` : ""} — ` +
          "measure again or record it as assumed with a reason",
      );
    }
  }

  return { held, measured, assumed, declared: seen.size };
}
