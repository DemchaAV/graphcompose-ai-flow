#!/usr/bin/env node
/**
 * scripts/test/table-header-gaps.test.mjs — a header missing where its table is.
 *
 * `repeatHeader()` brings a header back on every page THAT TABLE reaches. The
 * check read it as "every page of the document" and reported a real two-table
 * proposal three times over: its investment table only reaches page 3, so pages
 * 1 and 2 were failed for not carrying a header belonging to a table that is not
 * on them, and its timeline header matched 2 of its 4 tokens on page 1 out of
 * prose alone. Three findings, none real, on a document whose pagination worked
 * — and the agent reading them had to argue the harness down.
 *
 * There was no test on this rule at all, which is how it shipped.
 *
 * A gap is the one unambiguous case: present, missing, present again means the
 * table spans all three pages and lost its header in the middle. Everything
 * else is a table that has not started or has already ended, and this says
 * nothing about those.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { PRESENT_AT, findHeaderGaps, labelTokens } from "../lib/table-header-gaps.mjs";

const header = (id, label) => ({ id, label, role: "table-header" });

/** Pages carrying the words of `label`, by index — `true` renders the header. */
function pagesFor(label, carries) {
  const words = labelTokens(label).join(" ");
  return carries.map((has) => (has ? `${words} some row content` : "just body prose here"));
}

test("a header missing between two pages that carry it is reported", () => {
  const label = "Phase / Focus / Duration / Output";
  const gaps = findHeaderGaps({
    regions: [header("timeline-header", label)],
    pages: pagesFor(label, [true, false, true]),
  });

  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].page, 2);
  assert.deepEqual(gaps[0].spans, [1, 3]);
  assert.equal(gaps[0].region, "timeline-header");
});

test("a table that only reaches the last page is not failed for the pages before it", () => {
  // The investment table: absent from pages 1 and 2 because it is not there.
  const label = "Item / Amount (GBP)";
  assert.deepEqual(
    findHeaderGaps({
      regions: [header("investment-header", label)],
      pages: pagesFor(label, [false, false, true]),
    }),
    [],
  );
});

test("a table that ends before the document does is not failed for the rest", () => {
  const label = "Phase / Focus / Duration / Output";
  assert.deepEqual(
    findHeaderGaps({
      regions: [header("timeline-header", label)],
      pages: pagesFor(label, [true, true, false]),
    }),
    [],
  );
});

test("a header nobody found anywhere says nothing, rather than failing every page", () => {
  const label = "Item / Amount (GBP)";
  assert.deepEqual(
    findHeaderGaps({
      regions: [header("investment-header", label)],
      pages: pagesFor(label, [false, false, false]),
    }),
    [],
  );
});

test("two gaps in one span are both reported", () => {
  const label = "Phase / Focus / Duration / Output";
  const gaps = findHeaderGaps({
    regions: [header("t", label)],
    pages: pagesFor(label, [true, false, false, true]),
  });
  assert.deepEqual(gaps.map((g) => g.page), [2, 3]);
});

test("only a region typed table-header is judged", () => {
  const label = "Phase / Focus / Duration / Output";
  assert.deepEqual(
    findHeaderGaps({
      regions: [{ id: "t", label, role: "table" }, { id: "b", label, role: "content" }],
      pages: pagesFor(label, [true, false, true]),
    }),
    [],
  );
});

// --- what counts as present -----------------------------------------------------

test("short words are not evidence, because prose collides with them", () => {
  // "of", "and", "the" appear on every page of every document.
  assert.deepEqual(labelTokens("Item and Amount of the GBP"), ["item", "amount"]);
  assert.deepEqual(labelTokens("A / B / C"), []);
});

test("a label whose words are all too short is skipped rather than matched on noise", () => {
  assert.deepEqual(
    findHeaderGaps({ regions: [header("t", "A / B / C")], pages: ["x", "y", "z"] }),
    [],
  );
});

test("a partial match below the threshold does not count as the header", () => {
  // This is what put the timeline header on page 1: two of its four words
  // appeared in ordinary prose, which is 0.5 and must not read as present.
  const label = "Phase / Focus / Duration / Output";
  const gaps = findHeaderGaps({
    regions: [header("t", label)],
    pages: [
      "the phase of the project and its output are described here", // 2/4
      "unrelated prose",
      "phase focus duration output", // 4/4
      "phase focus duration output", // 4/4
    ],
  });
  // Present on 3 and 4 only, so pages 1 and 2 are before the span, not gaps.
  assert.deepEqual(gaps, []);
  assert.ok(PRESENT_AT > 0.5, "the threshold has to exclude a half-match");
});

test("the normalizer the caller passes is the one used", () => {
  // check-document-integrity strips ligature damage before matching; the rule
  // must not quietly do its own thing.
  const gaps = findHeaderGaps({
    regions: [header("t", "Phase Focus Duration Output")],
    pages: ["PHASE FOCUS DURATION OUTPUT", "nothing", "PHASE FOCUS DURATION OUTPUT"],
    normalize: (text) => text.toLowerCase(),
  });
  assert.deepEqual(gaps.map((g) => g.page), [2]);
});
