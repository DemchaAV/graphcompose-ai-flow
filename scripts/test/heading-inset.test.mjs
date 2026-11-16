#!/usr/bin/env node
/**
 * scripts/test/heading-inset.test.mjs — the body belongs under the heading's
 * title, and somebody has to say so.
 *
 * The run these cover measured its heading badge exactly — `main-badge`,
 * `bounds.x 0.313`, `repeats: 5`, in a region starting at `0.315` — built the
 * heading as an 18 pt lane plus a 6 pt gap, and then added every paragraph and
 * company name straight to the section with no left inset. Measured from the
 * render: the title at x 207.57, the summary paragraph at 183.57. Eight
 * revisions, every section, and the region's own box correct throughout.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  auditContentLeft,
  checkHeadingInset,
  headingLaneFor,
  headingTextInset,
  leftInsets,
  regionsWithLeadingContainer,
} from "../lib/heading-inset.mjs";

/** The nora-b8 numbers, to the digit the analysis recorded them at. */
const SUMMARY = { id: "summary", label: "Professional Summary", role: "content", bounds: { x: 0.315, y: 0.165, w: 0.65, h: 0.095 } };
const BADGE = { container: "main-badge", region: "summary", repeats: 5, bounds: { x: 0.313, y: 0.168, w: 0.033, h: 0.023 } };

/** The sidebar panel: at its region's edge, and the width of the region. */
const SIDEBAR = { id: "sidebar", label: "Sidebar", role: "panel", bounds: { x: 0, y: 0, w: 0.2815, h: 1 } };
const PANEL = { container: "sidebar-panel", region: "sidebar", bounds: { x: 0, y: 0, w: 0.2815, h: 1 } };

// ------------------------------------------------ which regions are asked ---

test("a marker at the region's own left edge is what makes two left edges", () => {
  const found = regionsWithLeadingContainer({ regions: [SUMMARY], shapeOwnership: [BADGE] });
  assert.equal(found.length, 1);
  assert.equal(found[0].region.id, "summary");
  assert.equal(found[0].container.container, "main-badge");
});

test("a surface the width of its region is not a marker", () => {
  // The whole point of "narrow": a panel that fills its region has no text
  // beside it, so there is no second edge to choose between.
  assert.deepEqual(regionsWithLeadingContainer({ regions: [SIDEBAR], shapeOwnership: [PANEL] }), []);
});

test("a container inset from its region's edge is not leading it", () => {
  // nora-b8's own sidebar-badge: attributed to the whole sidebar panel, and
  // sitting 0.033 in. It heads something, but not this region.
  const inset = { ...BADGE, container: "sidebar-badge", region: "sidebar", bounds: { x: 0.033, y: 0.2, w: 0.03, h: 0.02 } };
  assert.deepEqual(regionsWithLeadingContainer({ regions: [SIDEBAR], shapeOwnership: [inset] }), []);
});

test("a region or a container without bounds is not guessed at", () => {
  assert.deepEqual(regionsWithLeadingContainer({ regions: [{ id: "summary" }], shapeOwnership: [BADGE] }), []);
  assert.deepEqual(
    regionsWithLeadingContainer({ regions: [SUMMARY], shapeOwnership: [{ container: "x", region: "summary" }] }),
    [],
  );
});

// ------------------------------------------------------- the analysis half ---

test("THE SILENCE: a marker-headed region that says nothing is held", () => {
  const audit = auditContentLeft({ regions: [SUMMARY], shapeOwnership: [BADGE] });
  assert.equal(audit.checked, 1);
  assert.equal(audit.held.length, 1);
  assert.match(audit.held[0], /"summary" is headed by "main-badge"/);
  assert.match(audit.held[0], /two left edges/);
  // The recovery has to include the flush answer, or the check reads as an
  // instruction to indent every document.
  assert.match(audit.held[0], /write 0\.315 if the body really does start at the region's own edge/);
});

test("a flush body is a real answer, written as the region's own x", () => {
  const audit = auditContentLeft({
    regions: [{ ...SUMMARY, contentLeft: 0.315 }],
    shapeOwnership: [BADGE],
  });
  assert.deepEqual(audit.held, []);
  assert.equal(audit.checked, 1);
});

test("an indented body clears it too — the field is a measurement, not a verdict", () => {
  const audit = auditContentLeft({
    regions: [{ ...SUMMARY, contentLeft: 0.349 }],
    shapeOwnership: [BADGE],
  });
  assert.deepEqual(audit.held, []);
});

test("a document with no marker-headed region is not asked", () => {
  const audit = auditContentLeft({ regions: [SIDEBAR], shapeOwnership: [PANEL] });
  assert.equal(audit.checked, 0);
  assert.deepEqual(audit.held, []);
});

// ----------------------------------------------------------- the code half ---

/** nora-b8's own heading helper, trimmed to the geometry. */
const HEADER_HELPER = `
    private static void renderMainSectionHeader(SectionBuilder parent, String title, String iconToken) {
        parent.addLayerStack(ls -> ls.layer(new RowBuilder()
                .verticalAlign(RowVerticalAlign.CENTER)
                .columns(
                        DocumentRowColumn.fixed(18.0),
                        DocumentRowColumn.auto(),
                        DocumentRowColumn.weight(1.0),
                        DocumentRowColumn.fixed(5.0)
                )
                .gap(6)
                .addParagraph(p -> p.text(title).textStyle(STYLE_SECTION_TITLE))
                .build()));
    }
`;

/** Its caller, which adds the body straight to the section. */
const FLUSH_BODY = `
    public void renderSummary(SectionBuilder mainCol, DocSpec spec) {
        mainCol.addSection(sec -> {
            sec.spacing(4.0);
            renderMainSectionHeader(sec, spec.summary().title(), "section-summary");
            sec.addParagraph(p -> p.text(spec.summary().text()).textStyle(STYLE_BODY));
        });
    }
`;

const INSET_BODY = FLUSH_BODY.replace(
    "sec.addParagraph(p -> p.text(spec.summary().text()).textStyle(STYLE_BODY));",
    "sec.padding(new DocumentInsets(0, 0, 0, HEADING_TEXT_INSET));\n"
        + "            sec.addParagraph(p -> p.text(spec.summary().text()).textStyle(STYLE_BODY));",
);

const MAPPING = [{ region: "summary", renderMethod: "renderSummary" }];
const readMethod = (source, method) => {
  const at = source.indexOf(` ${method}(`);
  if (at === -1) return null;
  const open = source.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
};

test("the heading's own inset is read from the lane and the gap", () => {
  assert.equal(headingTextInset(HEADER_HELPER), 24, "18 pt lane plus a 6 pt gap");
  assert.equal(headingTextInset("no row here"), null);
});

test("a lane that is not a literal is not guessed at", () => {
  const computed = HEADER_HELPER.replace("fixed(18.0)", "fixed(BADGE + 1)");
  assert.equal(headingTextInset(computed), null);
});

test("THE DEFECT: the analysis says indented and the Java lays it flush", () => {
  const findings = checkHeadingInset({
    regions: [{ ...SUMMARY, contentLeft: 0.349 }],
    componentMapping: MAPPING,
    source: HEADER_HELPER + FLUSH_BODY,
    readMethod,
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "body-not-under-its-heading");
  assert.equal(findings[0].region, "summary");
  assert.equal(findings[0].method, "renderSummary");
  assert.match(findings[0].detail, /20 pt in, which is where the heading's title sits, not its marker/);
  assert.match(findings[0].detail, /24 pt lane before the title/);
});

test("a body the code does inset is not reported", () => {
  const findings = checkHeadingInset({
    regions: [{ ...SUMMARY, contentLeft: 0.349 }],
    componentMapping: MAPPING,
    source: HEADER_HELPER + INSET_BODY,
    readMethod,
  });
  assert.deepEqual(findings, []);
});

test("a flush design is never asked to change", () => {
  // The measurement says the body starts at the region's own edge. The same
  // flush code is then correct, and reporting it would be the check asserting a
  // convention rather than comparing two numbers.
  const findings = checkHeadingInset({
    regions: [{ ...SUMMARY, contentLeft: 0.315 }],
    componentMapping: MAPPING,
    source: HEADER_HELPER + FLUSH_BODY,
    readMethod,
  });
  assert.deepEqual(findings, []);
});

test("a region that stated nothing is left to the analysis barrier", () => {
  const findings = checkHeadingInset({
    regions: [SUMMARY],
    componentMapping: MAPPING,
    source: HEADER_HELPER + FLUSH_BODY,
    readMethod,
  });
  assert.deepEqual(findings, [], "one missing measurement is one finding, and it is not this one");
});

// -------------------------------------------------- reading the left inset ---

test("THE FALSE NEGATIVE: a bottom margin is not a left inset", () => {
  // The first version of the code check tested for the presence of a
  // padding/margin call. `renderSummary` carries a bottom margin, so the check
  // went silent on a body still flush against the marker.
  assert.deepEqual(leftInsets("sec.margin(new DocumentInsets(0, 0, 32.0, 0));"), [0]);
  assert.deepEqual(leftInsets("entry.padding(new DocumentInsets(5.0, 0, 5.0, 22.0));"), [22]);
  assert.deepEqual(leftInsets("sec.padding(4.0f, 0f, 4.0f, 20f);"), [20]);
});

test("a value from elsewhere is not a number this can read", () => {
  // And that is the answer the authoring rules ask for, so it must not be
  // reported against.
  assert.deepEqual(leftInsets("sec.padding(new DocumentInsets(0, 0, 0, HEADING_INSET));"), [null]);
  assert.deepEqual(leftInsets("sec.padding(new DocumentInsets(0, 0, 0, BADGE + GAP));"), [null]);
  assert.deepEqual(leftInsets("sec.padding(SECTION_INSETS);"), [null]);
});

test("a nested call inside the arguments does not split them", () => {
  assert.deepEqual(leftInsets("sec.padding(new DocumentInsets(pt(1), 0, 0, 12.0));"), [12]);
});

// --------------------------------------------- finding the heading's lane ---

/** An item row built BEFORE the heading, which is what misread the lane. */
const ITEM_ROW_FIRST = `
    private void renderAchievements(SectionBuilder side) {
        side.addSection("sidebar-achievements", sec -> {
            achRow.columns(DocumentRowColumn.fixed(18.0), DocumentRowColumn.weight(1.0));
            achRow.gap(6.0);
            renderSidebarHeading(sec, "trophy", "KEY ACHIEVEMENTS");
            sec.padding(new DocumentInsets(0, 0, 0, 14.0));
        });
    }
    private static void renderSidebarHeading(SectionBuilder section, String icon, String title) {
        headingRow.columns(DocumentRowColumn.fixed(20.0), DocumentRowColumn.weight(1.0));
        headingRow.gap(5.0);
        headingRow.addSection("sidebar-heading-badge", badgeSec -> {
            badgeSec.addContainer(badge -> badge.name("sidebar-heading-badge").circle(16.0));
        });
    }
`;

test("the lane is the marker's own row, not the first row in the method", () => {
  // 18 + 6 is the achievements item row; 20 + 5 is the heading the marker sits
  // in. Quoting the first was a number nobody could reproduce.
  assert.equal(headingLaneFor(ITEM_ROW_FIRST, "sidebar-heading-badge"), 25);
  assert.equal(headingTextInset(ITEM_ROW_FIRST), 24, "the naive read, kept as the last fallback");
});

test("a marker the template never names has no lane, and nothing is guessed", () => {
  assert.equal(headingLaneFor(ITEM_ROW_FIRST, "absent-badge"), null);
});

// ------------------------------------------ the inset that is not the lane ---

const ACHIEVEMENTS = {
  id: "sidebar-achievements",
  label: "Key Achievements",
  role: "content",
  bounds: { x: 0.035, y: 0.5, w: 0.215, h: 0.16 },
  contentLeft: 0.066,
};
const ACHIEVEMENTS_BADGE = {
  container: "sidebar-heading-badge",
  region: "sidebar-achievements",
  bounds: { x: 0.035, y: 0.5, w: 0.03, h: 0.02 },
};
const ACHIEVEMENTS_MAPPING = [{ region: "sidebar-achievements", renderMethod: "renderAchievements" }];

test("THE HALF-MEASURE: an inset that is not the heading's lane is reported", () => {
  const findings = checkHeadingInset({
    regions: [ACHIEVEMENTS],
    shapeOwnership: [ACHIEVEMENTS_BADGE],
    componentMapping: ACHIEVEMENTS_MAPPING,
    source: ITEM_ROW_FIRST,
    readMethod,
  });

  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "body-inset-is-not-the-heading-lane");
  assert.match(findings[0].detail, /a 25 pt lane before the title and insets its body by 14 pt/);
  assert.match(findings[0].detail, /11 pt apart/);
  assert.match(findings[0].detail, /name it once in baseConstants/);
});

test("an inset that IS the lane is the answer, and is not reported", () => {
  const matched = ITEM_ROW_FIRST.replace("0, 0, 0, 14.0", "0, 0, 0, 25.0");
  assert.deepEqual(
    checkHeadingInset({
      regions: [ACHIEVEMENTS],
      shapeOwnership: [ACHIEVEMENTS_BADGE],
      componentMapping: ACHIEVEMENTS_MAPPING,
      source: matched,
      readMethod,
    }),
    [],
  );
});

test("a derived inset ends the question, whatever it computes to", () => {
  // Its arithmetic is not this check's business: naming the quantity once is
  // what the authoring rules asked for, and reading through the name would
  // punish the right answer.
  const derived = ITEM_ROW_FIRST.replace("0, 0, 0, 14.0", "0, 0, 0, HEADING_TEXT_INSET");
  assert.deepEqual(
    checkHeadingInset({
      regions: [ACHIEVEMENTS],
      shapeOwnership: [ACHIEVEMENTS_BADGE],
      componentMapping: ACHIEVEMENTS_MAPPING,
      source: derived,
      readMethod,
    }),
    [],
  );
});
