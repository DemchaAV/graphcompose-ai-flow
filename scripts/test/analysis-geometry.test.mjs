#!/usr/bin/env node
/**
 * scripts/test/analysis-geometry.test.mjs — a container is measured, not described.
 *
 * The failure these lock down: a reference's competency boxes were rounded
 * rectangles of radius ~3px on a 32px box, white-bordered, all spanning the
 * sidebar's full width. The analysis called them "10 white rounded pill badges"
 * and "rounded capsule shape with subtle border"; the plan carried the words
 * forward; the author wrote cornerRadius(15) on a 33px box and let each one
 * shrink to its label. Every stage was faithful to what it was handed.
 *
 * Nothing was lying. `shapeOwnership` was three prose strings with
 * additionalProperties false, so a radius had nowhere to go even if someone had
 * measured one — and the guidance offered "circles / pills or badges / rounded
 * cards", a taxonomy with no bucket for a rectangle with a small radius.
 *
 * So the first test here is the one that matters: the old shape of an entry
 * must now be refused.
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validatorFor } from "../../tools/schema-validate/src/index.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const validate = validatorFor(path.join(repoRoot, "schemas", "visual-analysis.schema.json"));

/** The smallest analysis that validates, so each case breaks exactly one thing. */
const base = (extra = {}) => ({
  schemaVersion: 1,
  page: {
    format: "A4",
    orientation: "portrait",
    referencePx: { width: 1055, height: 1491 },
    aspect: 1.41327,
    sizePt: { width: 595.276, height: 841.89 },
    sizeSource: "measured-standard",
    pageCount: 1,
  },
  regions: [{ id: "sidebar", label: "Sidebar", role: "panel", bounds: { x: 0, y: 0, w: 0.28, h: 1 } }],
  ...extra,
});

/** The container the incident was about, measured from the reference. */
const COMPETENCY_BOX = {
  container: "competency-box",
  ownedContent: "icon and label",
  relationship: "an icon and a label share one row inside the box",
  region: "sidebar",
  repeats: 10,
  shape: "rounded-rectangle",
  cornerRadiusRatio: 0.09,
  sizing: "fill-parent",
  fill: { present: false },
  stroke: { present: true, color: "#F4CFC5", widthRatio: 0.03 },
  padding: { top: 0.26, right: 0.37, bottom: 0.26, left: 0.37 },
  gap: 0.25,
  contentAlign: { horizontal: "left", vertical: "center" },
  spacingToNext: 0.4,
};

const ok = (doc, why) => assert.equal(validate(doc).valid, true, `${why}: ${validate(doc).errors}`);
const bad = (doc, why) => assert.equal(validate(doc).valid, false, why);

test("THE REGRESSION: the old three-string entry is no longer a complete container", () => {
  // Exactly what the failing run wrote, and it validated.
  bad(
    base({
      shapeOwnership: [
        {
          container: "competency-pill",
          ownedContent: "competency-icon-and-label",
          relationship: "Icon and text inside rounded capsule shape with subtle border",
        },
      ],
    }),
    "prose alone must not describe a container any more",
  );
});

test("a fully measured container validates", () => {
  ok(base({ shapeOwnership: [COMPETENCY_BOX] }), "the reference's own box");
});

test("each measured field is required on its own", () => {
  for (const field of ["shape", "cornerRadiusRatio", "sizing", "fill", "stroke"]) {
    const entry = { ...COMPETENCY_BOX };
    delete entry[field];
    bad(base({ shapeOwnership: [entry] }), `${field} must be required`);
  }
});

test("a radius is a ratio of the shorter side, and cannot exceed a capsule", () => {
  ok(base({ shapeOwnership: [{ ...COMPETENCY_BOX, cornerRadiusRatio: 0 }] }), "square corners");
  ok(base({ shapeOwnership: [{ ...COMPETENCY_BOX, cornerRadiusRatio: 0.5 }] }), "a capsule");
  bad(base({ shapeOwnership: [{ ...COMPETENCY_BOX, cornerRadiusRatio: 0.9 }] }), "beyond a capsule");
  bad(base({ shapeOwnership: [{ ...COMPETENCY_BOX, cornerRadiusRatio: -0.1 }] }), "negative");
  // The whole point: 0.09 and 0.5 are different values, where "rounded" was one word.
  assert.notEqual(COMPETENCY_BOX.cornerRadiusRatio, 0.5);
});

test("a transparent container defined only by its border is representable", () => {
  // Previously impossible to state, and it is what the reference actually has.
  const entry = { ...COMPETENCY_BOX, fill: { present: false }, stroke: { present: true, color: "#F4CFC5" } };
  ok(base({ shapeOwnership: [entry] }), "no fill, a border, the ground showing through");

  // And it is a different document from a container filled to match the ground.
  const filled = { ...COMPETENCY_BOX, fill: { present: true, color: "#FDF4EF" } };
  ok(base({ shapeOwnership: [filled] }), "a fill that happens to match the background");
  assert.notDeepEqual(entry.fill, filled.fill, "one paints, the other does not");
});

test("width is a decision, not an inference", () => {
  for (const sizing of ["hug-content", "fill-parent", "fixed-ratio"]) {
    ok(base({ shapeOwnership: [{ ...COMPETENCY_BOX, sizing }] }), sizing);
  }
  bad(base({ shapeOwnership: [{ ...COMPETENCY_BOX, sizing: "whatever fits" }] }), "not an enum member");
});

test("shape is a closed set, so an invented adjective cannot slip through", () => {
  for (const shape of ["rectangle", "rounded-rectangle", "pill", "circle", "ellipse", "other"]) {
    ok(base({ shapeOwnership: [{ ...COMPETENCY_BOX, shape }] }), shape);
  }
  for (const shape of ["capsule", "badge", "rounded card", "soft rectangle"]) {
    bad(base({ shapeOwnership: [{ ...COMPETENCY_BOX, shape }] }), `"${shape}" is a description, not a shape`);
  }
});

test("padding is per side and alignment is per axis", () => {
  bad(
    base({ shapeOwnership: [{ ...COMPETENCY_BOX, padding: { top: 0.2, sides: 0.3 } }] }),
    "sides is not a padding edge",
  );
  bad(
    base({ shapeOwnership: [{ ...COMPETENCY_BOX, contentAlign: { horizontal: "middle" } }] }),
    "middle is not an alignment",
  );
  ok(
    base({ shapeOwnership: [{ ...COMPETENCY_BOX, contentAlign: { horizontal: "center", vertical: "baseline" } }] }),
    "baseline is distinct from centre and has to be sayable",
  );
});

test("an unmeasured entry cannot hide in an extra field", () => {
  bad(
    base({ shapeOwnership: [{ ...COMPETENCY_BOX, cornerRadius: "6px" }] }),
    "pixels in an invented key must be refused, not carried",
  );
});

test("an icon states its size against the text, its alignment, and whether it flows", () => {
  const icon = {
    id: "section-competencies",
    region: "sidebar",
    sizeRelativeToText: 1.45,
    verticalAlign: "center",
    gapToText: 0.35,
    inline: false,
  };
  ok(base({ icons: [icon] }), "an independently placed icon");

  for (const field of ["id", "sizeRelativeToText", "verticalAlign", "inline"]) {
    const partial = { ...icon };
    delete partial[field];
    bad(base({ icons: [partial] }), `${field} must be required`);
  }
  bad(base({ icons: [{ ...icon, sizeRelativeToText: 0 }] }), "an icon has a size");
  bad(base({ icons: [{ ...icon, verticalAlign: "middle" }] }), "middle is not an alignment");
  // inline is a boolean, not a shrug: the two build differently.
  bad(base({ icons: [{ ...icon, inline: "sort of" }] }), "inline is a decision");
});

test("the geometry blocks stay optional at the root, and empty is still honest", () => {
  // A document with no containers is possible; a container described without
  // geometry is not. The pressure belongs on the entry, not on the array.
  ok(base(), "no shapeOwnership at all");
  ok(base({ shapeOwnership: [], icons: [] }), "explicitly none");
});
