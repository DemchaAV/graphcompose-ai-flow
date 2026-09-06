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

import { REQUIRED_ROLES, ROLES, TOP_N, auditTypography, rankOf } from "../lib/typography-roles.mjs";

/** A recorded ranking, best first, in the shape `typography.mjs match` writes. */
const match = (role, families) => ({
  role,
  text: "PROFESSIONAL SUMMARY",
  ranked: families.map((family, i) => ({ rank: i + 1, family, score: 0.1 * (i + 1), separation: 0.05 })),
});

/** Both roles the audit insists on, measured against the same ranking. */
const bothMeasured = (fontName) => ({
  roles: [
    { role: "headings", fontName, source: "measured" },
    { role: "body", fontName, source: "measured" },
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
    matches: [],
  });

  assert.equal(audit.held.length, 1, "the prose fields are not roles");
});

test("a claim to have measured, with nothing recorded, is held — and says how to fix it", () => {
  const audit = auditTypography({ typography: bothMeasured("LATO"), matches: [] });

  assert.equal(audit.held.length, 2, "one per unbacked role");
  assert.match(audit.held[0], /claims to be measured and no match was recorded/);
  assert.match(audit.held[0], /typography\.mjs match --role headings/, "the message carries the command");
});

test("a measured role the ranking put first clears", () => {
  const audit = auditTypography({
    typography: bothMeasured("LATO"),
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
    matches: [match("headings", ranking), match("body", ranking)],
  });
  assert.deepEqual(inside.held, [], `rank ${TOP_N} is inside the window`);

  const outside = auditTypography({
    typography: bothMeasured("OPEN_SANS"),
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
    typography: { roles: [{ role: "headings", fontName: "PT_SERIF", source: "measured" }, { role: "body", fontName: "LATO", source: "measured" }] },
    matches: [match("headings", measured), match("body", measured)],
  });

  assert.equal(audit.held.length, 1, "only the heading role was wrong");
  assert.match(audit.held[0], /"headings" uses PT_SERIF/);
  assert.match(audit.held[0], /ranked 5 of 5/);
});

test("a family the recorded ranking never saw is held, not silently ranked last", () => {
  const audit = auditTypography({
    typography: bothMeasured("AMIRI"),
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
    matches: [],
  });

  assert.equal(audit.held.length, 2, "whitespace is not a reason");
  for (const held of audit.held) assert.match(held, /an assumption nobody can review is a guess/);
});

test("the two roles that set the page are named when either is missing", () => {
  const audit = auditTypography({
    typography: { roles: [{ role: "title", fontName: "LATO", source: "assumed", why: "display only" }] },
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
