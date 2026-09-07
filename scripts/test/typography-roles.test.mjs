#!/usr/bin/env node
/**
 * scripts/test/typography-roles.test.mjs — a face is measured, or it says it is not.
 *
 * The runs these come from put all twelve regions of one page at CRITICAL with
 * a spread of 13–22%. The largest single cause repeated across three runs and
 * two models: the reference sets its section headings in a bold grotesque and
 * every render set them in a serif. No barrier could have caught it —
 * `typography` was seven free strings with nothing required, and the field
 * authoring reads held "Poppins for body and a classic serif such as Spectral
 * or Tinos for display text".
 *
 * The matcher that answers this existed the whole time and none of the three
 * runs called it. So these fix the two halves: a role has to say whether a
 * measurement backs it, and a claim to have measured has to be backed.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { REQUIRED_ROLES, ROLES, TOP_N, auditTypography, measurementFault, rankOf } from "../lib/typography-roles.mjs";
import { COMPARABLE_ASPECT, MEANINGFUL_SEPARATION } from "../lib/typography-match.mjs";

/** A recorded ranking, best first, in the shape `typography.mjs match` writes. */
const match = (role, families) => ({
  role,
  text: "PROFESSIONAL SUMMARY",
  ranked: families.map((family, i) => ({ rank: i + 1, family, score: 0.1 * (i + 1), separation: 0.05 })),
});

/** A decisive size sweep for each required role, so size is never the reason. */
const SIZES = [
  { role: "headings", family: "LATO", size: 11, decisive: true },
  { role: "body", family: "LATO", size: 9, decisive: true },
];

/** Both roles the audit insists on, measured against the same ranking. */
const bothMeasured = (fontName) => ({
  roles: [
    { role: "headings", fontName, size: 11, source: "measured" },
    { role: "body", fontName, size: 9, source: "measured" },
  ],
});

test("THE CASE: a page with a reference and no declared roles is held", () => {
  // The state all three runs were in. Nothing was wrong with the artifact —
  // that is the point, and why the message has to name what is missing.
  const audit = auditTypography({ typography: {}, matches: [] });

  assert.equal(audit.declared, 0);
  assert.equal(audit.held.length, 1);
  assert.match(audit.held[0], /typography\.roles is empty/);
  for (const role of REQUIRED_ROLES) assert.match(audit.held[0], new RegExp(role));
});

test("prose alone does not count as declaring a face", () => {
  // The exact shape of the failing analyses: rich description, no commitment.
  const audit = auditTypography({
    typography: {
      headings: "Dark teal serif section headings with compact coral rules.",
      likelyFontFamily: "Poppins for body and a classic serif such as Spectral or Tinos for display text.",
    },
    sizes: SIZES,
    matches: [],
  });

  assert.equal(audit.held.length, 1, "the prose fields are not roles");
});

test("a claim to have measured, with nothing recorded, is held — and says how to fix it", () => {
  const audit = auditTypography({ typography: bothMeasured("LATO"), matches: [], sizes: SIZES });

  assert.equal(audit.held.length, 2, "one per unbacked role");
  assert.match(audit.held[0], /claims to be measured and no match was recorded/);
  assert.match(audit.held[0], /typography\.mjs match --role headings/, "the message carries the command");
});

test("a measured role the ranking put first clears", () => {
  const audit = auditTypography({
    typography: bothMeasured("LATO"),
    sizes: SIZES,
    matches: [match("headings", ["LATO", "BARLOW"]), match("body", ["LATO", "BARLOW"])],
  });

  assert.deepEqual(audit.held, []);
  assert.equal(audit.measured, 2);
  assert.equal(audit.assumed, 0);
});

test("the window is three deep, because the matcher cannot separate near neighbours", () => {
  const ranking = ["BARLOW", "FIRA_SANS", "LATO", "OPEN_SANS"];
  const inside = auditTypography({
    typography: bothMeasured("LATO"),
    sizes: SIZES,
    matches: [match("headings", ranking), match("body", ranking)],
  });
  assert.deepEqual(inside.held, [], `rank ${TOP_N} is inside the window`);

  const outside = auditTypography({
    typography: bothMeasured("OPEN_SANS"),
    sizes: SIZES,
    matches: [match("headings", ranking), match("body", ranking)],
  });
  assert.equal(outside.held.length, 2);
  assert.match(outside.held[0], /ranked 4 of 4/);
  assert.match(outside.held[0], /behind BARLOW/, "the alternative is named, not just the refusal");
});

test("THE MISS: a serif chosen against a grotesque reference is held", () => {
  // What the runs actually did, with the ranking the matcher would have given.
  const measured = ["LATO", "BARLOW", "FIRA_SANS", "OPEN_SANS", "PT_SERIF"];
  const audit = auditTypography({
    typography: { roles: [{ role: "headings", fontName: "PT_SERIF", size: 11, source: "measured" }, { role: "body", fontName: "LATO", size: 9, source: "measured" }] },
    sizes: SIZES,
    matches: [match("headings", measured), match("body", measured)],
  });

  assert.equal(audit.held.length, 1, "only the heading role was wrong");
  assert.match(audit.held[0], /"headings" uses PT_SERIF/);
  assert.match(audit.held[0], /ranked 5 of 5/);
});

test("a family the recorded ranking never saw is held, not silently ranked last", () => {
  const audit = auditTypography({
    typography: bothMeasured("AMIRI"),
    sizes: SIZES,
    matches: [match("headings", ["LATO", "BARLOW"]), match("body", ["LATO", "BARLOW"])],
  });

  assert.match(audit.held[0], /which the recorded match for it never ranked/);
  assert.match(audit.held[0], /it ranked LATO first/);
});

test("assumed with a reason clears — a face with no bundled equivalent is a real answer", () => {
  const audit = auditTypography({
    typography: {
      roles: [
        { role: "headings", fontName: "LATO", source: "assumed", why: "the reference face is a commercial grotesque with no bundled equivalent" },
        { role: "body", fontName: "LATO", source: "assumed", why: "same family, one weight down" },
      ],
    },
    sizes: SIZES,
    matches: [],
  });

  assert.deepEqual(audit.held, []);
  assert.equal(audit.assumed, 2);
  assert.equal(audit.measured, 0);
});

test("assumed without a reason is a guess, and is held as one", () => {
  const audit = auditTypography({
    typography: {
      roles: [
        { role: "headings", fontName: "LATO", source: "assumed" },
        { role: "body", fontName: "LATO", source: "assumed", why: "   " },
      ],
    },
    sizes: SIZES,
    matches: [],
  });

  assert.equal(audit.held.length, 2, "whitespace is not a reason");
  for (const held of audit.held) assert.match(held, /an assumption nobody can review is a guess/);
});

test("the two roles that set the page are named when either is missing", () => {
  const audit = auditTypography({
    typography: { roles: [{ role: "title", fontName: "LATO", source: "assumed", why: "display only" }] },
    sizes: SIZES,
    matches: [],
  });

  assert.equal(audit.held.length, REQUIRED_ROLES.length);
  assert.match(audit.held.join(" "), /no "headings" role/);
  assert.match(audit.held.join(" "), /no "body" role/);
});

test("one role resolves to one face", () => {
  const audit = auditTypography({
    typography: {
      roles: [
        { role: "headings", fontName: "LATO", source: "assumed", why: "a" },
        { role: "headings", fontName: "AMIRI", source: "assumed", why: "b" },
        { role: "body", fontName: "LATO", source: "assumed", why: "c" },
      ],
    },
    sizes: SIZES,
    matches: [],
  });

  assert.match(audit.held.join(" "), /"headings" is declared twice/);
});

test("rankOf reads a ranking case-insensitively, and refuses to invent a rank", () => {
  const ranking = match("headings", ["LATO", "BARLOW"]);

  assert.equal(rankOf(ranking, "lato"), 1);
  assert.equal(rankOf(ranking, " Barlow "), 2);
  assert.equal(rankOf(ranking, "AMIRI"), null, "absent is not last");
  assert.equal(rankOf(null, "LATO"), null);
  assert.equal(rankOf({ ranked: "not an array" }, "LATO"), null);
  assert.equal(rankOf(ranking, undefined), null);
});

test("the role vocabulary is the one the schema publishes", () => {
  // Drifting these apart would let an analysis validate and then be audited
  // against a role name this module has never heard of.
  for (const required of REQUIRED_ROLES) assert.ok(ROLES.includes(required), `${required} is not a role`);
});

// ------------------------------- an order is not always a measurement ---
//
// The first run to reach this barrier called the tool, recorded the ranking and
// wrote `source: "measured"` for both roles. Neither ranking had measured
// anything, in two different ways, and both were visible in the numbers the
// tool had already written down.

/** The heading ranking exactly as that run recorded it. */
const INDECISIVE = {
  role: "headings",
  text: "NORA BENNETT",
  ranked: [
    { rank: 1, family: "PT_SERIF", score: 0.0914, separation: 0.0061, widthRatio: 0.9768 },
    { rank: 2, family: "TIMES_ROMAN", score: 0.0975, separation: null, widthRatio: 1.0389 },
  ],
};

/** The body ranking from the same run: letterforms matched, widths did not. */
const INCOMPARABLE = {
  role: "body",
  text: "Dynamic and detail-oriented Event Manager with over 7 years of experience delivering",
  ranked: [
    { rank: 1, family: "HELVETICA", score: 1.1649, separation: 0.1362, widthRatio: 0.379 },
    { rank: 2, family: "UBUNTU", score: 1.3011, separation: null, widthRatio: 0.3295 },
  ],
};

test("THE CASE: a winner inside the measurement's own noise decided nothing", () => {
  // Re-run over three families instead of forty-eight, the same crop put
  // TIMES_ROMAN first. A winner that changes with the candidate set is not one.
  const fault = measurementFault(INDECISIVE);

  assert.ok(fault, "0.0061 of separation was accepted");
  assert.match(fault, /leads by 0\.0061/);
  assert.match(fault, /inside the measurement's own noise/);
  assert.match(fault, /TIMES_ROMAN 0\.0975/, "the runner-up is quoted, so the reader can judge it");
});

test("THE OTHER CASE: a crop that does not hold the string is not a font result", () => {
  // score 1.1649 with a shape penalty of only 0.194: the letterforms matched
  // and the widths were incomparable.
  const fault = measurementFault(INCOMPARABLE);

  assert.ok(fault, "widthRatio 0.379 was accepted");
  assert.match(fault, /not the same shape \(widthRatio 0\.379\)/);
  assert.match(fault, /re-cut it to the exact line/);
});

test("both faults reach the audit, and name the role", () => {
  const audit = auditTypography({
    typography: {
      roles: [
        { role: "headings", fontName: "PT_SERIF", source: "measured" },
        { role: "body", fontName: "HELVETICA", source: "measured" },
      ],
    },
    sizes: SIZES,
    matches: [INDECISIVE, INCOMPARABLE],
  });

  assert.equal(audit.held.length, 2);
  assert.match(audit.held.join("\n"), /"headings" claims to be measured and its match decided nothing/);
  assert.match(audit.held.join("\n"), /"body" claims to be measured and its match decided nothing/);
});

test("a decisive, comparable match is not held", () => {
  // The controlled case: a family fed its own crop and the correct string.
  const good = {
    role: "headings",
    text: "Handgloves 0123",
    ranked: [
      { rank: 1, family: "BARLOW_CONDENSED", score: 0.0082, separation: 0.3213, widthRatio: 1 },
      { rank: 2, family: "PT_SERIF", score: 0.3295, separation: null, widthRatio: 1.2786 },
    ],
  };
  assert.equal(measurementFault(good), null);
});

test("a condensed cut of a family is a font difference, not a bad crop", () => {
  // The CLI's own warning names this case, so the band has to admit it.
  for (const widthRatio of [0.75, 1.35]) {
    const fault = measurementFault({
      ranked: [{ rank: 1, family: "BARLOW_CONDENSED", score: 0.2, separation: 0.1, widthRatio }],
    });
    assert.equal(fault, null, `widthRatio ${widthRatio} was refused`);
  }
  assert.ok(Math.abs(Math.log(0.379)) > COMPARABLE_ASPECT, "the real defect is outside the band");
  assert.ok(Math.abs(Math.log(0.9768)) < COMPARABLE_ASPECT, "the real valid crop is inside it");
});

test("a recording made before these fields existed is not held for lacking them", () => {
  // Holding on a missing field would refuse a run for having been measured
  // before the check was written.
  assert.equal(measurementFault({ ranked: [{ rank: 1, family: "LATO", score: 0.1 }] }), null);
  assert.equal(measurementFault({ ranked: [] }), null);
  assert.equal(measurementFault(null), null);
});

test("the noise line is the one the tool prints, not a second opinion", () => {
  assert.equal(MEANINGFUL_SEPARATION, 0.02);
  assert.ok(INDECISIVE.ranked[0].separation < MEANINGFUL_SEPARATION);
});

// ------------------------------------------ the size, not only the face ---
//
// The run this comes from measured a face for every role and a size for none.
// Its contacts were set at 6.2 and then 6.4pt, chosen so the longest address
// would stay on one line — the size traded away to avoid fixing the column.
// `typography.mjs search` answers this and was called once in ten revisions.

const FACES = [match("headings", ["LATO"]), match("body", ["LATO"])];

test("THE CASE: a role with a measured face and no measured size is held", () => {
  const audit = auditTypography({
    typography: {
      roles: [
        { role: "headings", fontName: "LATO", source: "measured" },
        { role: "body", fontName: "LATO", source: "measured" },
      ],
    },
    matches: FACES,
    sizes: [],
  });

  assert.equal(audit.held.length, 2);
  assert.match(audit.held[0], /declares no size/);
  assert.match(audit.held[0], /typography\.mjs search --role headings --family LATO/, "the command is ready to run");
  assert.match(audit.held[0], /page\.referencePx\.width ÷ page\.sizePt\.width/, "and the scale it needs is derived, not guessed");
});

test("a size with no sweep behind it is a number somebody typed", () => {
  const audit = auditTypography({ typography: bothMeasured("LATO"), matches: FACES, sizes: [] });
  assert.match(audit.held[0], /claims 11pt with no recorded size sweep behind it/);
});

test("a sweep the tool itself calls indecisive does not back a size", () => {
  // A flat curve cannot tell 10.4 from 10.6, and `decisive` is the tool saying so.
  const audit = auditTypography({
    typography: bothMeasured("LATO"),
    matches: FACES,
    sizes: [
      { role: "headings", size: 11, decisive: false },
      { role: "body", size: 9, decisive: true },
    ],
  });

  assert.equal(audit.held.length, 1);
  assert.match(audit.held[0], /the sweep that backs it was not decisive/);
});

test("a size that disagrees with its own sweep is held, with both numbers", () => {
  const audit = auditTypography({
    typography: bothMeasured("LATO"),
    matches: FACES,
    sizes: [
      { role: "headings", size: 13.5, decisive: true },
      { role: "body", size: 9, decisive: true },
    ],
  });

  assert.equal(audit.held.length, 1);
  assert.match(audit.held[0], /claims 11pt and the sweep measured 13\.5pt/);
});

test("rounding inside a quarter point is not a disagreement", () => {
  // The sweep steps in 0.25pt, so an analysis rounding 11.25 to 11 agrees.
  const audit = auditTypography({
    typography: bothMeasured("LATO"),
    matches: FACES,
    sizes: [
      { role: "headings", size: 11.25, decisive: true },
      { role: "body", size: 9.25, decisive: true },
    ],
  });

  assert.deepEqual(audit.held, []);
});

test("only the two roles that set the page are asked for a size", () => {
  // A size for every marker and table cell is a form to fill in.
  const audit = auditTypography({
    typography: {
      roles: [
        { role: "headings", fontName: "LATO", size: 11, source: "measured" },
        { role: "body", fontName: "LATO", size: 9, source: "measured" },
        { role: "meta", fontName: "LATO", source: "assumed", why: "one step down from body" },
      ],
    },
    matches: FACES,
    sizes: SIZES,
  });

  assert.deepEqual(audit.held, []);
});
