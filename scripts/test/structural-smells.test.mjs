#!/usr/bin/env node
/**
 * scripts/test/structural-smells.test.mjs — geometry that sits on children when
 * it belongs on their parent.
 *
 * A template can be pixel-perfect and built wrong: three siblings each carrying
 * `margin(0, 0, 5, 0)` render exactly like one parent carrying `spacing(5)`, so
 * every gate the loop has is blind to the difference. This is the check that is
 * not.
 *
 * The near-misses matter more than the hits. This repository has already had
 * one check that scanned too broadly and had to be rewritten, and the census
 * behind these thresholds found 21 groups that a naive rule would have flagged
 * on its first run — every one of them `DocumentInsets.zero()`, which
 * neutralises a default rather than stating shared geometry. So each rule here
 * is pinned from both sides.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { checkStructuralSmells } from "../lib/structural-smells.mjs";

/** The pinned pack, as far as these tests are concerned. */
const NEWLINE = String.fromCharCode(10);

const PRIMITIVES = new Set(["addTimeline", "addTable", "pageBackgrounds"]);

const check = (body, options = {}) =>
  checkStructuralSmells({
    source: `class T {\n    private void render(SectionBuilder section) {\n${body}\n    }\n}\n`,
    primitives: PRIMITIVES,
    ...options,
  });

const kinds = (findings) => findings.map((f) => f.kind).sort();

// ------------------------------------------------------- repeated siblings ---

test("two siblings stating the same inset is reported at two, not three", () => {
  // The census behind this threshold: nothing in the repository repeats a
  // shared inset three or more times, so a rule that only fired at three would
  // have found nothing at all. The pattern is real at two.
  const findings = check(`
        section.addParagraph(p -> p.text("English").margin(0, 0, 5, 0));
        section.addParagraph(p -> p.text("German").margin(0, 0, 5, 0));
  `);
  assert.deepEqual(kinds(findings), ["repeated-sibling-offset"]);
  assert.equal(findings[0].count, 2);
});

test("a repeated single-edge gap is told to become spacing(...), not just 'move it up'", () => {
  const [finding] = check(`
        section.addParagraph(p -> p.text("A").margin(0, 0, 5, 0));
        section.addParagraph(p -> p.text("B").margin(0, 0, 5, 0));
        section.addParagraph(p -> p.text("C").margin(0, 0, 5, 0));
  `);
  assert.match(finding.detail, /bottom gap repeated is what `spacing\(\.\.\.\)` on their parent is for/);
  assert.equal(finding.count, 3);
});

test("a repeated multi-edge inset gets the general advice, since spacing cannot express it", () => {
  const [finding] = check(`
        section.addSection(s -> s.padding(4, 8, 4, 8));
        section.addSection(s -> s.padding(4, 8, 4, 8));
  `);
  assert.match(finding.detail, /belongs on their common parent/);
  assert.ok(!/spacing/.test(finding.detail));
});

test("a repeated zero inset is not a shared offset — it neutralises a default", () => {
  // 21 groups in the repository look exactly like this. Flagging them would
  // have produced 21 false positives on the first run.
  const findings = check(`
        section.addLine(l -> l.horizontal(120).margin(DocumentInsets.zero()));
        section.addLine(l -> l.horizontal(120).margin(DocumentInsets.zero()));
        section.addLine(l -> l.horizontal(120).margin(DocumentInsets.zero()));
        section.addParagraph(p -> p.text("x").margin(0, 0, 0, 0));
        section.addParagraph(p -> p.text("y").margin(0, 0, 0, 0));
  `);
  assert.deepEqual(findings, []);
});

test("an inset derived from a named constant is the relational-geometry rule working", () => {
  // `padding(DocumentInsets.of(TABLE_PADDING + 1))` on two tables is one number
  // in one place — the state the authoring rules ask for. Reporting it would
  // tell an author to undo the thing they were told to do.
  const findings = check(`
        section.addTable(t -> t.padding(DocumentInsets.of(TABLE_PADDING + 1)));
        section.addTable(t -> t.padding(DocumentInsets.of(TABLE_PADDING + 1)));
  `);
  assert.deepEqual(findings, []);
});

test("one sibling with a distinct inset is a local exception, not a smell", () => {
  const findings = check(`
        section.addParagraph(p -> p.text("A").margin(0, 0, 5, 0));
        section.addParagraph(p -> p.text("B").margin(0, 0, 9, 0));
  `);
  assert.deepEqual(findings, []);
});

// ------------------------------------------------------- negative clusters ---

test("negative margins cluster into a finding, and a single one does not", () => {
  const cluster = check(`
        section.addParagraph(p -> p.text("A").margin(-4, 0, 0, 0));
        section.addParagraph(p -> p.text("B").margin(-6, 0, 0, 0));
        section.addParagraph(p -> p.text("C").margin(-8, 0, 0, 0));
  `);
  assert.ok(kinds(cluster).includes("negative-margin-cluster"));

  const single = check(`
        section.addLine(l -> l.vertical(9).margin(-4.35, 0, 12, 3));
  `);
  assert.deepEqual(single, [], "one negative inset is a deliberate local exception");
});

// -------------------------------------------------------- manual timelines ---

test("a rail beside repeated markers is a hand-built timeline", () => {
  const findings = check(`
        section.addLine(l -> l.vertical(180).thickness(1));
        section.addCircle(6, ACCENT, c -> c.center(label("1")));
        section.addCircle(6, ACCENT, c -> c.center(label("2")));
        section.addCircle(6, ACCENT, c -> c.center(label("3")));
  `);
  assert.ok(kinds(findings).includes("manual-semantic-pattern"));
  assert.match(findings.find((f) => f.kind === "manual-semantic-pattern").detail, /addTimeline/);
});

test("a gauge is not a timeline — one rail and one marker", () => {
  // This is the real `skillBar()` from mint-editorial-cv, and the first version
  // of the rule reported it as a timeline: it counted the local `markerLeft`
  // identifier as two markers. A rule that misreads one construct as another is
  // worse than no rule, because the next real finding is not believed either.
  const findings = check(`
        double markerLeft = Math.max(0.0, Math.min(1.0, value)) * SKILL_BAR_WIDTH;
        section.addLine(line -> line.horizontal(SKILL_BAR_WIDTH).thickness(0.65));
        section.addLine(line -> line.vertical(SKILL_MARKER_HEIGHT).margin(-4.35, 0, 12, markerLeft));
  `);
  assert.ok(!kinds(findings).includes("manual-semantic-pattern"));
});

test("the rule is silent on a pack that has no timeline primitive", () => {
  // Before `addTimeline` existed, this construction was the correct answer.
  // Reporting it would tell an author to call something that is not there.
  const body = `
        section.addLine(l -> l.vertical(180).thickness(1));
        section.addCircle(6, ACCENT, c -> c.center(label("1")));
        section.addCircle(6, ACCENT, c -> c.center(label("2")));
        section.addCircle(6, ACCENT, c -> c.center(label("3")));
  `;
  assert.ok(kinds(check(body)).includes("manual-semantic-pattern"));
  assert.ok(!kinds(check(body, { primitives: new Set() })).includes("manual-semantic-pattern"));
});

test("a template that already calls the primitive is not told to call it", () => {
  const findings = check(`
        section.addTimeline(tl -> tl.entry(TimelineMarker.dot(), e -> e.title("A")));
        section.addLine(l -> l.vertical(180));
        section.addCircle(6, ACCENT, c -> c.center(label("1")));
        section.addCircle(6, ACCENT, c -> c.center(label("2")));
        section.addCircle(6, ACCENT, c -> c.center(label("3")));
  `);
  assert.ok(!kinds(findings).includes("manual-semantic-pattern"));
});

// ------------------------------------------------------ coordinate clusters ---

test("many distinct positioning literals in one region is coordinate soup", () => {
  const findings = check(`
        section.addParagraph(p -> p.text("a").margin(3, 0, 0, 0));
        section.addParagraph(p -> p.text("b").margin(0, 7, 0, 0));
        section.addParagraph(p -> p.text("c").margin(0, 0, 11, 0));
        section.addParagraph(p -> p.text("d").margin(0, 0, 0, 13));
        section.addParagraph(p -> p.text("e").margin(17, 0, 0, 0));
        section.addParagraph(p -> p.text("f").margin(0, 19, 0, 0));
        section.addParagraph(p -> p.text("g").margin(0, 0, 23, 0));
        section.addParagraph(p -> p.text("h").margin(0, 0, 0, 29));
  `);
  assert.ok(kinds(findings).includes("independent-geometry-cluster"));
});

test("the same derived constant used many times is not a cluster", () => {
  const findings = check(`
        section.addParagraph(p -> p.text("a").margin(GAP, 0, 0, 0));
        section.addParagraph(p -> p.text("b").margin(GAP, 0, 0, 0));
        section.addParagraph(p -> p.text("c").margin(GAP, 0, 0, 0));
        section.addParagraph(p -> p.text("d").margin(GAP, 0, 0, 0));
        section.addParagraph(p -> p.text("e").margin(GAP, 0, 0, 0));
        section.addParagraph(p -> p.text("f").margin(GAP, 0, 0, 0));
        section.addParagraph(p -> p.text("g").margin(GAP, 0, 0, 0));
        section.addParagraph(p -> p.text("h").margin(GAP, 0, 0, 0));
  `);
  assert.deepEqual(findings, [], "deriving from one constant is the rule working, not a smell");
});

// -------------------------------------------------------------- integration ---

test("a clean template produces nothing at all", () => {
  const findings = check(`
        section.addSection("LanguagesContent", content -> content
                .padding(0, 0, 0, 18)
                .spacing(5)
                .addParagraph(p -> p.text("English"))
                .addParagraph(p -> p.text("Ukrainian"))
                .addParagraph(p -> p.text("German")));
  `);
  assert.deepEqual(findings, [], "the worked example from the authoring rules must be silent");
});

test("findings are attributed to the method that owns them", () => {
  const findings = checkStructuralSmells({
    source: `
class T {
    private void renderSkills(SectionBuilder section) {
        section.addParagraph(p -> p.text("A").margin(0, 0, 5, 0));
        section.addParagraph(p -> p.text("B").margin(0, 0, 5, 0));
    }
    private void renderContact(SectionBuilder section) {
        section.addParagraph(p -> p.text("mail").margin(0, 0, 2, 0));
    }
}
`,
    primitives: PRIMITIVES,
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].method, "renderSkills");
});

// ------------------------------------------------------------ bundle layout ---

/** A template in the shape publishing splits, parameterised by its members. */
const template = (members) => `package com.example;

public final class DemoTemplate {

    private static final double LABEL = 8.5;

    public void compose(DocumentSession document, DemoSpec spec) {
        renderMasthead(document, spec);
    }

    private void renderMasthead(SectionBuilder section, DemoSpec spec) {
        section.addParagraph(p -> p.text(spec.name()));
    }
${members}
}
`;

test("a template that would publish flat is told so while it can still be fixed", () => {
  const findings = checkStructuralSmells({
    source: template("    private final IconCache cache = new IconCache();\n"),
    primitives: PRIMITIVES,
  });

  assert.deepEqual(kinds(findings), ["bundle-publishes-flat"]);
  assert.match(findings[0].detail, /instance field: cache/);
  assert.equal(findings[0].method, "DemoTemplate");
});

test("a template that would publish as a project says nothing about layout", () => {
  const findings = checkStructuralSmells({ source: template(""), primitives: PRIMITIVES });
  assert.deepEqual(findings, []);
});

test("a fragment that is not a template is not told about bundles", () => {
  // The rest of this file feeds three-line snippets to the same function.
  // "This is not a template" is not a finding about a template.
  const findings = checkStructuralSmells({
    source: "class T {\n    private void render(SectionBuilder s) {\n        s.add(x());\n    }\n}\n",
    primitives: PRIMITIVES,
  });
  assert.deepEqual(findings, []);
});

test("the plan takes part, because a name collision is one way the split refuses", () => {
  // slate-orange's plan mapped two regions to one method and named it after a
  // method its own source declares. Predicting the layout without the plan
  // would have said "structured" and publishing would have said otherwise.
  const source = template(`
    private void renderMastheadRule(SectionBuilder section) {
        section.addLine(l -> l.width(1));
    }
`);
  const plan = {
    componentMapping: [
      { region: "masthead-rule", renderMethod: "renderMasthead" },
      { region: "masthead-rule-2", renderMethod: "renderMastheadRule" },
    ],
  };

  assert.deepEqual(checkStructuralSmells({ source, primitives: PRIMITIVES, plan }), []);
});

test("prose that publishing will refuse is named in the loop, with its line", () => {
  // Four of the fourteen templates explain a decision by naming the revision it
  // was taken in. The portability scanner blocks on that — and it blocked after
  // the publisher had written the files, naming a generated path the author
  // cannot edit. The line to change is in the revision.
  const source = template("    // Kept at 1.35 because revision-001 used 1.2." + NEWLINE);
  const findings = checkStructuralSmells({ source, primitives: PRIMITIVES });

  assert.deepEqual(kinds(findings), ["publish-blocked"]);
  assert.match(findings[0].detail, /harness vocabulary/);
  assert.match(findings[0].method, /^line [0-9]+$/);
});

test("a template that names no revision is told nothing about publishing", () => {
  assert.deepEqual(checkStructuralSmells({ source: template(""), primitives: PRIMITIVES }), []);
});
