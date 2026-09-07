#!/usr/bin/env node
/**
 * scripts/test/container-fidelity.test.mjs — the code against the measurement.
 *
 * The run these come from measured the competency cards correctly and then
 * painted them white anyway. Every gate passed: the analysis was right, the
 * plan named the container, and nothing looked at what the Java did with it.
 *
 * The Java in these cases is the Java that shipped, trimmed to the method.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { checkContainerFills, checkContainerGrowth, constructions, paintsFill } from "../lib/container-fidelity.mjs";
import { methodBody } from "../lib/region-primitives.mjs";

/** Exactly the shape the failing template had, down to the call order. */
const PAINTED = `
    private static void renderSidebarCompetencies(SectionBuilder sidebar, CvSpec spec) {
        sidebar.addSection("SidebarCompetencies", sec -> {
            for (CvSpec.CompetencyItem item : sb.competencies().items()) {
                sec.addContainer(c -> {
                    c.roundedRect(148, 21, 3.5);
                    c.fillColor(DocumentColor.WHITE);
                    c.stroke(DocumentStroke.of(CORAL_BORDER, 0.6));
                });
            }
        });
    }
`;

/** The same method, built to the measurement. */
const HONEST = PAINTED.replace("                    c.fillColor(DocumentColor.WHITE);\n", "");

const CARD = { container: "competency-pill", fill: { present: false } };
const MAPPING = [{ region: "sidebar-competencies", renderMethod: "renderSidebarCompetencies", containers: ["competency-pill"] }];

const run = (source, shapeOwnership = [CARD], componentMapping = MAPPING) =>
  checkContainerFills({ shapeOwnership, componentMapping, source, readMethod: methodBody });

test("THE CASE: a measured-unfilled container that the template paints", () => {
  const findings = run(PAINTED);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "fill-contradicts-measurement");
  assert.equal(findings[0].container, "competency-pill");
  assert.equal(findings[0].method, "renderSidebarCompetencies");
  assert.match(findings[0].detail, /one paints, one lets the ground through/);
});

test("the same method built to the measurement reports nothing", () => {
  assert.deepEqual(run(HONEST), []);
});

test("a container measured as filled is not the business of this check", () => {
  const findings = run(PAINTED, [{ container: "competency-pill", fill: { present: true, color: "#ffffff" } }]);
  assert.deepEqual(findings, []);
});

test("a transparent fill is not a fill", () => {
  // `fillColor(DocumentColor.rgba(0, 0, 0, 0))` is in the corpus and is a
  // correct way to say "no fill". Flagging every fillColor would call it a bug.
  for (const argument of [
    "DocumentColor.rgba(0, 0, 0, 0)",
    "DocumentColor.rgba(255, 255, 255, 0.0)",
    "DocumentColor.TRANSPARENT",
    "null",
  ]) {
    const source = PAINTED.replace("DocumentColor.WHITE", argument);
    assert.deepEqual(run(source), [], `${argument} was read as a fill`);
  }
});

test("a name ties the fill to the right container when a method builds several", () => {
  const twoContainers = `
    private static void renderSidebar(SectionBuilder sidebar) {
        sidebar.addContainer(c -> {
            c.name("sidebar-marker");
            c.circle(15);
            c.fillColor(DocumentColor.rgb(2, 50, 45));
        });
        sidebar.addContainer(c -> {
            c.name("competency-pill");
            c.roundedRect(148, 21, 3.5);
            c.stroke(DocumentStroke.of(CORAL_BORDER, 0.6));
        });
    }
  `;
  const mapping = [{ region: "sidebar", renderMethod: "renderSidebar", containers: ["competency-pill", "sidebar-marker"] }];
  const owned = [CARD, { container: "sidebar-marker", fill: { present: true, color: "#02322d" } }];

  assert.deepEqual(run(twoContainers, owned, mapping), [], "the filled one is the one that paints");
});

test("a name catches the fill on the container it belongs to", () => {
  const painted = `
    private static void renderSidebar(SectionBuilder sidebar) {
        sidebar.addContainer(c -> {
            c.name("sidebar-marker");
            c.circle(15);
        });
        sidebar.addContainer(c -> {
            c.name("competency-pill");
            c.fillColor(DocumentColor.WHITE);
        });
    }
  `;
  const mapping = [{ region: "sidebar", renderMethod: "renderSidebar", containers: ["competency-pill", "sidebar-marker"] }];
  const findings = run(painted, [CARD, { container: "sidebar-marker", fill: { present: false } }], mapping);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].container, "competency-pill");
  assert.equal(findings[0].kind, "fill-contradicts-measurement");
});

test("when it cannot say which container was painted, it asks for the name", () => {
  // Two unnamed constructions, two unfilled containers: picking one would be a
  // guess, and this pair of checks exists to stop guessing.
  const ambiguous = `
    private static void renderSidebar(SectionBuilder sidebar) {
        sidebar.addContainer(c -> { c.circle(15); c.fillColor(DocumentColor.WHITE); });
        sidebar.addContainer(c -> { c.roundedRect(148, 21, 3.5); });
    }
  `;
  const mapping = [{ region: "sidebar", renderMethod: "renderSidebar", containers: ["competency-pill", "sidebar-marker"] }];
  const findings = run(ambiguous, [CARD, { container: "sidebar-marker", fill: { present: false } }], mapping);

  assert.equal(findings.length, 2);
  for (const finding of findings) {
    assert.equal(finding.kind, "fill-not-attributable");
    assert.match(finding.detail, /name the container in the builder/);
  }
});

test("an ambiguous method that paints nothing is left alone", () => {
  const quiet = `
    private static void renderSidebar(SectionBuilder sidebar) {
        sidebar.addContainer(c -> { c.circle(15); });
        sidebar.addContainer(c -> { c.roundedRect(148, 21, 3.5); });
    }
  `;
  const mapping = [{ region: "sidebar", renderMethod: "renderSidebar", containers: ["competency-pill", "sidebar-marker"] }];
  assert.deepEqual(run(quiet, [CARD, { container: "sidebar-marker", fill: { present: false } }], mapping), []);
});

test("a container the plan never claimed is left to the barrier that reports that", () => {
  assert.deepEqual(run(PAINTED, [CARD], [{ region: "x", renderMethod: "renderX", containers: [] }]), []);
});

test("a method the template does not define is left to the check that reports that", () => {
  assert.deepEqual(run("class T {}"), []);
});

test("the builder forms the corpus writes are all recognised as constructions", () => {
  const chained = `
    void render() {
        panel.addContainer(c -> c.name("a").roundedRect(1, 2, 3));
        DocumentNode n = new ShapeContainerBuilder().name("b").circle(4).fillColor(TEAL).build();
        flow.addEllipse(e -> e.circle(2).fillColor(CORAL));
    }
  `;
  const found = constructions(methodBody(chained, "render"));

  assert.equal(found.length, 3);
  assert.deepEqual(found.map((c) => c.name), ["a", "b", null]);
  assert.equal(paintsFill(found[0].text), false);
  assert.equal(paintsFill(found[1].text), true);
  assert.equal(paintsFill(found[2].text), true);
});

test("a chained builder does not swallow the statements after it", () => {
  // `new XBuilder()…build();` ends at its semicolon: reading to the end of the
  // method would attribute the next container's fill to this one.
  const source = `
    void render() {
        DocumentNode a = new ShapeContainerBuilder().name("a").circle(4).build();
        DocumentNode b = new ShapeContainerBuilder().name("b").circle(4).fillColor(TEAL).build();
    }
  `;
  const found = constructions(methodBody(source, "render"));

  assert.equal(paintsFill(found[0].text), false, "the first construction picked up the second's fill");
  assert.equal(paintsFill(found[1].text), true);
});

// ------------------------------------ a card that cannot grow with its label ---
//
// The run this comes from measured the competency card as `fill-parent` — true
// of its width — and built it as a fixed box with the text laid on top. The
// longest label came out "Budgeting & Financial Managemen", clipped at the
// border. No field was broken: `sizing` describes the width only, and nothing
// asks what happens when the content needs a second line.

/** The card exactly as that template built it. */
const FIXED_CARD = `
    private void renderSidebarCompetencies(SectionBuilder sidebar, Spec spec) {
        for (Spec.Competency comp : spec.sidebar().competencies()) {
            sidebar.addContainer(c -> {
                c.name("competency-box");
                c.roundedRect(144.0, 21.5, 2.5);
                c.stroke(DocumentStroke.of(COLOR_BORDER_CORAL, 0.5));
                ParagraphBuilder pb = new ParagraphBuilder();
                pb.inlineText(comp.name(), STYLE_COMPETENCY);
                c.position(pb.build(), 7.5, 0, LayerAlign.CENTER_LEFT);
            });
        }
    }
`;

/** The same card built so its content decides its height. */
const GROWING_CARD = `
    private void renderSidebarCompetencies(SectionBuilder sidebar, Spec spec) {
        for (Spec.Competency comp : spec.sidebar().competencies()) {
            sidebar.addSection(card -> {
                card.name("competency-box");
                card.softPanel(DocumentColor.TRANSPARENT, 2.5, 7.5, DocumentStroke.of(COLOR_BORDER_CORAL, 0.5));
                card.addParagraph(p -> p.text(comp.name()).textStyle(STYLE_COMPETENCY));
            });
        }
    }
`;

const CARD_SPEC = { container: "competency-box", sizing: "fill-parent", repeats: 10, fill: { present: false } };
const CARD_MAPPING = [{ region: "sidebar-competencies", renderMethod: "renderSidebarCompetencies", containers: ["competency-box"] }];

const growth = (source, shapeOwnership = [CARD_SPEC], componentMapping = CARD_MAPPING) =>
  checkContainerGrowth({ shapeOwnership, componentMapping, source, readMethod: methodBody });

test("THE CASE: a repeating card with both dimensions fixed and its text laid over it", () => {
  const findings = growth(FIXED_CARD);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "container-cannot-grow");
  assert.equal(findings[0].container, "competency-box");
  assert.match(findings[0].detail, /clipped rather than wrapped/);
  assert.match(findings[0].detail, /softPanel\(color, radius, padding, stroke\)/, "the call that does grow is named");
});

test("built to flow, it reports nothing", () => {
  assert.deepEqual(growth(GROWING_CARD), []);
});

test("a badge that hugs its content is the shape it should be", () => {
  // A fixed circle around an icon is correct, and holding it would refuse the
  // thing `sizing: hug-content` exists to describe.
  const badge = { ...CARD_SPEC, sizing: "hug-content" };
  assert.deepEqual(growth(FIXED_CARD, [badge]), []);
});

test("a panel that occurs once is a surface, not a row of cards", () => {
  // The monogram panel really is one fixed surface; the label that overflows is
  // the one that repeats with different text each time.
  assert.deepEqual(growth(FIXED_CARD, [{ ...CARD_SPEC, repeats: 1 }]), []);
});

test("a fixed box whose content flows inside it is not held", () => {
  // Only the pair matters: both dimensions literal AND content positioned over
  // the shape. A sized box that still flows its children can grow its content.
  const flowed = FIXED_CARD.replace(
    'c.position(pb.build(), 7.5, 0, LayerAlign.CENTER_LEFT);',
    'c.center(pb.build());',
  );
  assert.deepEqual(growth(flowed), []);
});

test("a container the plan never claimed is left to the barrier that reports that", () => {
  assert.deepEqual(growth(FIXED_CARD, [CARD_SPEC], [{ region: "x", renderMethod: "renderX", containers: [] }]), []);
});
