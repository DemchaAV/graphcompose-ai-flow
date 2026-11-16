#!/usr/bin/env node
/**
 * scripts/test/palette-claims.test.mjs — the palette prose against the measured containers.
 *
 * The analysis these come from said `fill.present: false` on the competency
 * cards and, four fields away, that the page background is used in "competency
 * boxes fill". Both in the first write, both validating. Authoring read the
 * prose and painted the cards white.
 *
 * The quiet half matters as much as the loud one: a check that fires on honest
 * sentences gets turned off, so several of these pin clauses that must NOT be
 * held.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { auditPalette, claimsFill, clausesOf, distinctiveTokens, namesContainer, stem } from "../lib/palette-claims.mjs";

/** The container as the failing analysis measured it. */
const CARD = { container: "competency-pill", fill: { present: false } };

test("THE CASE: the palette says filled, the container is measured unfilled", () => {
  const audit = auditPalette({
    colors: [{ role: "page-bg", value: "#ffffff", usedIn: "main content area background, competency boxes fill" }],
    shapeOwnership: [CARD],
  });

  assert.equal(audit.held.length, 1);
  assert.match(audit.held[0], /"competency-pill" is measured as unfilled/);
  assert.match(audit.held[0], /claims it is filled/);
  assert.match(audit.held[0], /competency boxes fill/, "the clause is quoted, so a reader can judge it at a glance");
});

test("a filled container is not held, however the palette phrases it", () => {
  const audit = auditPalette({
    colors: [{ role: "page-bg", value: "#ffffff", usedIn: "competency boxes fill" }],
    shapeOwnership: [{ container: "competency-pill", fill: { present: true, color: "#ffffff" } }],
  });

  assert.deepEqual(audit.held, []);
});

test("naming the container without claiming a fill is left alone", () => {
  // Borders, ink and text are the honest majority of what a palette says.
  const audit = auditPalette({
    colors: [
      { role: "border", value: "#f0b8a8", usedIn: "borders of competency pill boxes in sidebar" },
      { role: "ink", value: "#333333", usedIn: "competency labels" },
    ],
    shapeOwnership: [CARD],
  });

  assert.deepEqual(audit.held, []);
});

test("claiming a fill without naming this container is left alone", () => {
  const audit = auditPalette({
    colors: [{ role: "teal", value: "#062d28", usedIn: ["Identity panel", "filled rating dots"] }],
    shapeOwnership: [CARD, { container: "sidebar-section-marker", fill: { present: false } }],
  });

  assert.deepEqual(audit.held, [], "neither container is named by 'filled rating dots'");
});

test("background is not treated as a fill word, on purpose", () => {
  // "sidebar background surface" is a correct sentence about a real fill. A
  // check that holds correct sentences is a check somebody turns off.
  const audit = auditPalette({
    colors: [{ role: "sidebar-bg", value: "#fef2ef", usedIn: "sidebar background surface, behind the competency stack" }],
    shapeOwnership: [{ container: "competency-pill", fill: { present: false } }],
  });

  assert.deepEqual(audit.held, []);
});

test("usedIn is read as a string, a list, or absent — the corpus writes all three", () => {
  const asList = auditPalette({
    colors: [{ role: "page-bg", value: "#fff", usedIn: ["main paper", "competency boxes fill"] }],
    shapeOwnership: [CARD],
  });
  assert.equal(asList.held.length, 1);

  const absent = auditPalette({ colors: [{ role: "page-bg", value: "#fff" }], shapeOwnership: [CARD] });
  assert.deepEqual(absent.held, []);

  const nulled = auditPalette({ colors: [{ role: "page-bg", value: "#fff", usedIn: null }], shapeOwnership: [CARD] });
  assert.deepEqual(nulled.held, []);
});

test("a container named only by shape nouns is not attributed to any clause", () => {
  // "card" identifies nothing; guessing which card is what this exists to stop.
  const audit = auditPalette({
    colors: [{ role: "page-bg", value: "#fff", usedIn: "the cards fill" }],
    shapeOwnership: [{ container: "card", fill: { present: false } }],
  });

  assert.deepEqual(audit.held, []);
  assert.equal(audit.checked, 0);
});

test("every distinctive word has to land, not just one", () => {
  // "sidebar fill" must not convict `sidebar-section-marker`: the clause is
  // about the sidebar, and the marker is a different thing inside it.
  const audit = auditPalette({
    colors: [{ role: "peach", value: "#fef2ef", usedIn: "sidebar fill" }],
    shapeOwnership: [{ container: "sidebar-section-marker", fill: { present: false } }],
  });

  assert.deepEqual(audit.held, []);
});

test("plurals do not hide a contradiction", () => {
  const audit = auditPalette({
    colors: [{ role: "page-bg", value: "#fff", usedIn: "competencies fill" }],
    shapeOwnership: [{ container: "competency-pill", fill: { present: false } }],
  });

  assert.equal(audit.held.length, 1);
});

test("stem ties the forms a palette actually writes", () => {
  assert.equal(stem("competencies"), "competency");
  assert.equal(stem("boxes"), "box");
  assert.equal(stem("cards"), "card");
  assert.equal(stem("Competency"), "competency");
  assert.equal(stem("is"), "is", "a short word is not stemmed into nothing");
});

test("the pieces answer on their own, so a held clause can be explained", () => {
  assert.deepEqual(distinctiveTokens("competency-pill"), ["competency"]);
  assert.deepEqual(distinctiveTokens("sidebar-section-marker"), ["sidebar", "section"]);
  assert.deepEqual(distinctiveTokens("card"), []);

  assert.equal(claimsFill("competency boxes fill"), true);
  assert.equal(claimsFill("filled rating dots"), true);
  assert.equal(claimsFill("borders of the boxes"), false);

  assert.deepEqual(clausesOf("a, b; c"), ["a", "b", "c"]);
  assert.deepEqual(clausesOf(["a", "b"]), ["a", "b"]);
  assert.deepEqual(clausesOf(null), []);

  assert.equal(namesContainer("competency boxes fill", ["competency"]), true);
  assert.equal(namesContainer("competency boxes fill", ["competency", "sidebar"]), false);
  assert.equal(namesContainer("anything", []), false);
});
