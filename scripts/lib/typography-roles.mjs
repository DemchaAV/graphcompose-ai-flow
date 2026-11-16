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

import { COMPARABLE_ASPECT, MEANINGFUL_SEPARATION } from "./typography-match.mjs";

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

/** The winning entry of a ranking, whole, so a message can quote its numbers. */
function winnerEntry(match) {
  return (match?.ranked ?? []).find((e) => e?.rank === 1) ?? match?.ranked?.[0] ?? null;
}

/** The family the ranking put first, for a message that names the alternative. */
function winnerOf(match) {
  const first = winnerEntry(match);
  return typeof first?.family === "string" ? first.family : null;
}

/**
 * Did this ranking measure anything, or only produce an order?
 *
 * Two ways it can produce an order and measure nothing, both seen in one run:
 *
 *   - the top families sit inside the measurement's own noise. `PT_SERIF 0.0914
 *     | TIMES_ROMAN 0.0975` separated by 0.0061, and re-running the same crop
 *     over three families instead of forty-eight put TIMES_ROMAN first. A
 *     winner that changes with the candidate set is not a winner.
 *   - the crop and the specimen are not the same shape. A body role's winner
 *     scored 1.1649 with a shape penalty of only 0.194 and a `widthRatio` of
 *     **0.379** — the letterforms matched and the widths were incomparable,
 *     which is a crop that does not hold the string, not a font difference.
 *
 * Both are the tool's own numbers. Nothing had to be invented to notice either,
 * and until now nothing read them: the ranking was recorded and the winner was
 * taken, with the same authority as a decisive match.
 *
 * Returns null when the recording predates these fields — an older match is not
 * evidence of a problem, and holding on a missing field would refuse a run for
 * having been measured before the check existed.
 */
export function measurementFault(match) {
  const winner = winnerEntry(match);
  if (!winner) return null;

  if (typeof winner.widthRatio === "number" && winner.widthRatio > 0) {
    const aspect = Math.abs(Math.log(winner.widthRatio));
    if (aspect > COMPARABLE_ASPECT) {
      return (
        `the crop and the specimen are not the same shape (widthRatio ${winner.widthRatio}) — ` +
        "the crop does not hold that string on its own, so re-cut it to the exact line before trusting the order"
      );
    }
  }

  if (typeof winner.separation === "number" && winner.separation < MEANINGFUL_SEPARATION) {
    const runnerUp = (match.ranked ?? [])[1];
    return (
      `${winner.family} leads by ${winner.separation}, inside the measurement's own noise ` +
      `(under ${MEANINGFUL_SEPARATION})` +
      (runnerUp ? ` — ${winner.family} ${winner.score} against ${runnerUp.family} ${runnerUp.score}` : "") +
      " — match a longer sample, or record the class you can defend as assumed"
    );
  }

  return null;
}

/**
 * Hold the analysis when a type role is unmeasured, unexplained, or contradicted.
 *
 * @param {object} input
 * @param {object|null|undefined} input.typography the analysis's `typography`
 * @param {Array<object>} input.matches recorded matches, `typography-match.json`'s `matches`
 * @returns {{held: string[], measured: number, assumed: number, declared: number}}
 */
/**
 * Was this role's size measured, or traded away to stop a line wrapping?
 *
 * The run this comes from measured a face for every role and a size for none.
 * Its contacts were set at 6.2 and then 6.4pt, chosen so the longest address
 * would stay on one line — the size given up to avoid fixing the column width.
 * `typography.mjs search` answers this and was called once in ten revisions.
 *
 * `decisive` is the tool's own word: a flat curve cannot tell 10.4 from 10.6,
 * and it says so rather than returning the lowest point of noise.
 */
function sizeFault(role, sizes) {
  if (typeof role.size !== "number") {
    return (
      "declares no size — run: node scripts/typography.mjs search --role " +
      `${role.role} --family ${role.fontName} --reference <crop.png> --text "<the exact line>" ` +
      "--from 6 --to 14 --step 0.25 --scale <page.referencePx.width ÷ page.sizePt.width> --project <id>"
    );
  }
  return sizeUnbacked(role, sizes);
}

/**
 * Is the number this role states backed by a sweep that measured it?
 *
 * Split out of {@link sizeFault} because the two halves have different
 * audiences. "Declares no size" is asked only of a measured role — a role with
 * no crop to work from has nothing to sweep. "The number you wrote is not one
 * anybody measured" is asked of every role that writes one.
 */
function sizeUnbacked(role, sizes) {
  const measured = sizes.find((s) => s?.role === role.role);
  if (!measured) return `claims ${role.size}pt with no recorded size sweep behind it`;
  if (measured.decisive !== true) {
    return `claims ${role.size}pt and the sweep that backs it was not decisive — the curve is flat, so the size it returned is the lowest point of noise`;
  }
  if (typeof measured.size === "number" && Math.abs(measured.size - role.size) > 0.5) {
    return `claims ${role.size}pt and the sweep measured ${measured.size}pt`;
  }
  return null;
}

export function auditTypography({ typography, matches = [], sizes = [] }) {
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
      // A face may be assumed; a number may not. The escape hatch answers "no
      // crop to match a family against", which is a statement about the family.
      // A role that assumed its face and then writes 6.4pt is claiming a
      // measurement — and that is the exact trade this gate was written for:
      // contacts set by trial at 6.2 then 6.4 so the longest address would not
      // wrap, trading the type size away instead of fixing the column. A role
      // that assumes and states no size is still exempt: there is nothing to
      // check.
      if (REQUIRED_ROLES.includes(name) && typeof role.size === "number") {
        const fault = sizeUnbacked(role, sizes);
        if (fault) held.push(`"${name}" is assumed and ${fault}`);
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

    // Before asking where the family placed: did the ranking measure anything?
    // An order over candidates that are all indistinguishable, or all compared
    // against the wrong crop, has a first place and no meaning.
    const fault = measurementFault(match);
    if (fault) {
      held.push(`"${name}" claims to be measured and its match decided nothing: ${fault}`);
      continue;
    }

    // Only the two roles that set the page: a size for every marker and table
    // cell is a form to fill in, and these two are where a wrong size shows.
    if (REQUIRED_ROLES.includes(name)) {
      const fault = sizeFault(role, sizes);
      if (fault) held.push(`"${name}" ${fault}`);
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
