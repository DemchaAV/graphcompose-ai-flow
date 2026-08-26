#!/usr/bin/env node
/**
 * scripts/test/evidence-package.test.mjs — the package must be bounded, and it
 * must be willing to say it does not know.
 *
 * The geometry here comes from the committed engine snapshot
 * (`fixtures/charcoal-gold-cv/`); the region descriptions are authored, because
 * that is what they are in real life — a model's reading of the reference
 * image, not a measurement. Keeping that line straight is the point of the
 * whole exercise: the package joins one measured source to one described one,
 * and the value is entirely in not confusing which is which.
 *
 * Two properties matter more than any individual field.
 *
 * **Boundedness.** The package exists so a review pass never loads a 227 KB
 * snapshot to answer a question about one node. A package that grew to
 * snapshot-size would be a slower way of doing the thing it replaced, so its
 * size is asserted rather than hoped for.
 *
 * **Refusal.** It classifies four of seven causes and returns `UNKNOWN` with
 * candidates for the rest. A test that only checked the happy classifications
 * would pass just as well against a version that guessed `TYPOGRAPHY` whenever
 * it was unsure — which is the failure mode this replaces.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ASSET_INTERIOR_THRESHOLD_PERCENT,
  GEOMETRY_TOLERANCE_FRACTION,
  SHAPE_AGREEMENT_TOLERANCE,
  OWNER_MATCH_FLOOR,
  buildEvidencePackage,
  classifyCause,
  displacement,
  regionOwner,
  regionToPageRect,
  summarise,
} from "../lib/evidence-package.mjs";
import { loadSnapshot, resolveNode, topOf } from "../lib/layout-inspector.mjs";

/** A region as a model would have written it, derived from where a node really is. */
const boundsForNode = (node, canvas) => ({
  x: node.placementX / canvas.pageWidth,
  y: (canvas.pageHeight - topOf(node)) / canvas.pageHeight,
  w: node.placementWidth / canvas.pageWidth,
  h: node.placementHeight / canvas.pageHeight,
});

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE = path.join(repoRoot, "scripts", "test", "fixtures", "charcoal-gold-cv", "layout-snapshot.json");
const TYPOGRAPHY_FIXTURE = path.join(repoRoot, "scripts", "test", "fixtures", "typography-snapshot", "layout-snapshot.json");
const model = loadSnapshot(JSON.parse(fs.readFileSync(FIXTURE, "utf8")));
const canvas = model.canvas;

/**
 * The fractional bounds a model would have written for a node it is looking at,
 * derived from where the engine actually put that node.
 *
 * Going through the real geometry rather than typing four decimals means the
 * round trip — points → fraction → points — is exercised on real numbers, and a
 * sign error in the y flip cannot hide behind a symmetric fixture.
 */
function boundsFor(name, { dx = 0, dy = 0 } = {}) {
  const node = resolveNode(model, name);
  return {
    x: (node.placementX + dx) / canvas.pageWidth,
    y: (canvas.pageHeight - (topOf(node) + dy)) / canvas.pageHeight,
    w: node.placementWidth / canvas.pageWidth,
    h: node.placementHeight / canvas.pageHeight,
  };
}

const region = (id, name, over = {}, shift = {}) => ({
  id,
  label: `${name} region`,
  role: "content",
  page: 1,
  bounds: boundsFor(name, shift),
  ...over,
});

const build = (input) => buildEvidencePackage({ model, ...input });

// ------------------------------------------------------- the coordinate flip ---

test("region bounds survive the trip into page coordinates", () => {
  const sidebar = resolveNode(model, "Sidebar");
  const rect = regionToPageRect(boundsFor("Sidebar"), canvas);
  assert.ok(Math.abs(rect.x - sidebar.placementX) < 0.01);
  assert.ok(Math.abs(rect.width - sidebar.placementWidth) < 0.01);
  assert.ok(Math.abs(rect.top - topOf(sidebar)) < 0.01);
  assert.ok(Math.abs(rect.height - sidebar.placementHeight) < 0.01);
});

test("the y flip is real: a region low in the image is low in y", () => {
  // Bounds are read off an image, where y grows downward. The snapshot is PDF
  // space, where it grows upward. Getting this backwards would report every
  // vertical delta with the wrong sign and send the reviewer the wrong way.
  const high = regionToPageRect({ x: 0, y: 0, w: 1, h: 0.1 }, canvas);
  const low = regionToPageRect({ x: 0, y: 0.9, w: 1, h: 0.1 }, canvas);
  assert.equal(high.top, canvas.pageHeight);
  assert.ok(low.top < high.top);
  assert.ok(Math.abs(low.bottom) < 0.01, "a region at the image's bottom edge reaches y = 0");
});

// ------------------------------------------------------------ owner picking ---

test("the owner is the node whose box best coincides with the region", () => {
  const rect = regionToPageRect(boundsFor("Skills"), canvas);
  const { node, match } = regionOwner(model, rect);
  assert.equal(node.entityName, "Skills");
  assert.ok(match > 0.99);
});

test("a region read slightly wide still finds the section, not the whole column", () => {
  // The real failure this replaced: the reference's `sidebar-skills` bounds
  // start 0.63pt left of the Skills section, so a containment test skipped
  // Skills and named the 797pt Sidebar column — whose displacement then read
  // 338pt and meant nothing at all.
  const skills = resolveNode(model, "Skills");
  const rect = regionToPageRect(
    { ...boundsFor("Skills"), x: (skills.placementX - 0.63) / canvas.pageWidth },
    canvas,
  );
  const { node } = regionOwner(model, rect);
  assert.equal(node.entityName, "Skills");
});

test("a region matching nothing well gets no owner rather than a bad one", () => {
  // Every number downstream is computed against the owner, so a poor match
  // would produce confident nonsense. A thin band across the middle of the page
  // corresponds to no single node.
  const rect = regionToPageRect({ x: 0.1, y: 0.45, w: 0.8, h: 0.01 }, canvas);
  const found = regionOwner(model, rect);
  assert.equal(found.node, null);
  assert.ok(found.match < OWNER_MATCH_FLOOR);
  assert.match(found.basis, /closely enough|does not overlap|no node overlaps/);
});

// -------------------------------------------------------- cause: what it is ---

test("pagination outranks everything and short-circuits", () => {
  const verdict = classifyCause({
    pagination: { expected: 2, actual: 1 },
    displaced: { deltaX: 400, deltaY: 400 },
    tolerance: 3,
  });
  assert.equal(verdict.cause, "PAGINATION");
  assert.match(verdict.basis, /different layout/);
});

test("a displaced owner is GEOMETRY", () => {
  const pkg = build({ region: region("skills", "Skills", {}, { dx: 40 }) });
  assert.equal(pkg.cause, "GEOMETRY");
  assert.equal(pkg.layout.displacement.deltaX, -40);
  assert.match(pkg.causeBasis, /past the .* tolerance/);
});

test("a box within tolerance is not GEOMETRY, however different the pixels", () => {
  // The single most valuable thing the package decides: whether to touch the
  // layout at all. 40% of pixels differing says nothing about position.
  const pkg = build({
    region: region("skills", "Skills"),
    regionStats: { percent: 40, classification: "CRITICAL" },
  });
  assert.equal(pkg.cause, "UNKNOWN");
  assert.deepEqual(pkg.causeCandidates, ["TYPOGRAPHY", "PAINT", "CONTENT"]);
  assert.match(pkg.causeBasis, /not geometry/);
});

test("tolerance is wide enough to absorb a hand-read bound", () => {
  const tolerance = Math.min(canvas.pageWidth, canvas.pageHeight) * GEOMETRY_TOLERANCE_FRACTION;
  assert.ok(tolerance > 2.5 && tolerance < 4, `expected roughly 3pt on A4, got ${tolerance}`);
  const pkg = build({ region: region("skills", "Skills", {}, { dx: 2 }) });
  assert.equal(pkg.cause, "UNKNOWN", "2pt is inside the analyst's own reading error");
});

test("a correctly-placed image whose pixels are wrong is an ASSET, with the prohibition attached", () => {
  const pkg = build({
    region: region("photo", "ProfilePhoto", { role: "image" }),
    regionStats: { percent: ASSET_INTERIOR_THRESHOLD_PERCENT + 5, classification: "CRITICAL" },
  });
  assert.equal(pkg.cause, "ASSET");
  assert.match(pkg.prohibition, /Replace the asset/);
  // The whole reason the rule exists: an agent that nudges margins until the
  // wrong picture lines up has made the template worse and the diff better.
  assert.deepEqual(pkg.recommendedProperties, []);
  assert.match(pkg.causeBasis, /Do NOT compensate an asset with margins/);
});

test("a region that is not the node's shape cannot support a displacement", () => {
  // The one false positive the classifier produced on real data, pinned. The
  // reference CV's `masthead` region covers a name, a title and a rule; the
  // Masthead node is 158pt narrower — 45% off the region's own width. The 11.5pt
  // between their corners measures that disagreement about what the region is,
  // not a layout defect, and calling it GEOMETRY sent a reviewer to move a block
  // that had not moved.
  const wideRegion = { ...region("masthead", "Masthead"), bounds: null };
  const node = resolveNode(model, "Masthead");
  wideRegion.bounds = {
    x: node.placementX / canvas.pageWidth,
    y: (canvas.pageHeight - topOf(node) - 12) / canvas.pageHeight,
    w: (node.placementWidth * 1.8) / canvas.pageWidth,
    h: node.placementHeight / canvas.pageHeight,
  };

  const pkg = build({ region: wideRegion, regionStats: { percent: 10 } });
  assert.equal(pkg.cause, "UNKNOWN");
  assert.match(pkg.causeBasis, /not the same box/);
  assert.match(pkg.causeBasis, /Re-read the region's bounds/);
  assert.ok(pkg.causeCandidates.includes("GEOMETRY"), "geometry is not ruled out — it is unproven");
});

test("the shape gate does not suppress a genuine displacement", () => {
  // The gate must key on SIZE, not on overlap. A node displaced by 40pt overlaps
  // its region no better than one that is simply the wrong shape, so an
  // overlap-based floor would have silenced the true positives with the false one.
  assert.equal(SHAPE_AGREEMENT_TOLERANCE, 0.25);
  const pkg = build({ region: region("skills", "Skills", {}, { dx: 40 }) });
  assert.equal(pkg.cause, "GEOMETRY", "same size, moved — that is exactly what GEOMETRY means");
});

test("a displaced image is GEOMETRY, not ASSET — position is checked first", () => {
  const pkg = build({
    region: region("photo", "ProfilePhoto", { role: "image" }, { dy: 40 }),
    regionStats: { percent: 90, classification: "CRITICAL" },
  });
  assert.equal(pkg.cause, "GEOMETRY");
});

test("a content region with wrong pixels is never called an ASSET", () => {
  const pkg = build({
    region: region("skills", "Skills", { role: "content" }),
    regionStats: { percent: 95, classification: "CRITICAL" },
  });
  assert.equal(pkg.cause, "UNKNOWN");
});

test("PAINT and CONTENT are never assigned automatically", () => {
  // The guard against the obvious future "improvement". Nothing deterministic
  // separates them, so anything assigning one would be guessing. TYPOGRAPHY left
  // this list when the engine began reporting declared-versus-resolved fonts —
  // but only for a substitution, which is a fact, never for a size or a weight.
  const causes = new Set();
  for (const percent of [0, 5, 30, 60, 99]) {
    for (const role of ["content", "image", "icon", "divider", "background"]) {
      for (const shift of [{}, { dx: 1 }, { dy: 2 }, { dx: 30 }]) {
        causes.add(
          build({ region: region("r", "Skills", { role }, shift), regionStats: { percent } }).cause,
        );
      }
    }
  }
  assert.ok(!causes.has("PAINT"));
  assert.ok(!causes.has("CONTENT"));
  assert.ok(!causes.has("TYPOGRAPHY"), "the fixture has no substituted font, so nothing may claim one");
  assert.deepEqual([...causes].sort(), ["ASSET", "GEOMETRY", "UNKNOWN"]);
});

// ------------------------------------------------------------- typography ----

test("a substituted font is TYPOGRAPHY, and it outranks a geometry verdict", () => {
  // The measurement the engine added for exactly this: the style asked for
  // Helvetica-Bold and the document is set in Helvetica. It lays out and draws
  // without error, so no pixel comparison will ever report it. And it is checked
  // BEFORE geometry on purpose — a substituted font changes every glyph width in
  // the run, so the box is the wrong size *because* the type is wrong. Calling it
  // GEOMETRY would send the next pass to move a block whose position is a symptom.
  const substituted = [{ declaredFont: "Helvetica-Bold", resolvedFont: "Helvetica" }];
  const verdict = classifyCause({
    displaced: { deltaX: 400, deltaY: 400 },
    tolerance: 3,
    substitutedFonts: substituted,
  });
  assert.equal(verdict.cause, "TYPOGRAPHY");
  assert.match(verdict.basis, /asked for Helvetica-Bold and the document is set in Helvetica/);
  assert.deepEqual(verdict.candidates, []);
});

test("pagination still outranks a substituted font", () => {
  // Ordering matters in both directions: a document that paginated differently
  // makes every per-node reading meaningless, including which run is where.
  const verdict = classifyCause({
    pagination: { expected: 2, actual: 1 },
    substitutedFonts: [{ declaredFont: "Helvetica-Bold", resolvedFont: "Helvetica" }],
  });
  assert.equal(verdict.cause, "PAGINATION");
});

test("the typography package names the run, and forbids fixing it with geometry", () => {
  const model = loadSnapshot(JSON.parse(fs.readFileSync(TYPOGRAPHY_FIXTURE, "utf8")));
  const heading = resolveNode(model, "Heading");
  const pkg = buildEvidencePackage({
    model,
    region: {
      id: "heading",
      role: "content",
      page: 1,
      bounds: boundsForNode(heading, model.canvas),
    },
    regionStats: { percent: 30, classification: "MAJOR" },
  });

  assert.equal(pkg.cause, "TYPOGRAPHY");
  assert.deepEqual(pkg.typography.substituted.map((s) => s.declaredFont), ["Helvetica-Bold"]);
  assert.equal(pkg.typography.reported, true);
  assert.match(pkg.prohibition, /Do not adjust geometry/);
  assert.deepEqual(pkg.recommendedProperties, [], "geometry is not the fix here");
});

test("a region whose text is fine is not called TYPOGRAPHY", () => {
  const model = loadSnapshot(JSON.parse(fs.readFileSync(TYPOGRAPHY_FIXTURE, "utf8")));
  const body = resolveNode(model, "Body");
  const pkg = buildEvidencePackage({
    model,
    region: { id: "body", role: "content", page: 1, bounds: boundsForNode(body, model.canvas) },
    regionStats: { percent: 40, classification: "MAJOR" },
  });

  assert.equal(pkg.cause, "UNKNOWN");
  assert.equal(pkg.typography.runs, 1);
  assert.deepEqual(pkg.typography.substituted, []);
});

test("a render with no typography at all says so, rather than reporting none", () => {
  // The distinction a consumer must not collapse: "this region has no font
  // problem" and "nothing looked" are different answers, and the second one is
  // what every revision rendered before GraphCompose 2.2.2 gives.
  const older = loadSnapshot(JSON.parse(fs.readFileSync(FIXTURE, "utf8")));
  assert.equal(older.hasTypography, false);

  const pkg = buildEvidencePackage({
    model: older,
    region: region("skills", "Skills"),
    regionStats: { percent: 40 },
  });
  assert.equal(pkg.typography.reported, false);
  assert.match(pkg.typography.note, /predates the engine/);
  assert.equal(pkg.cause, "UNKNOWN", "an unlooked-at font is not a clean bill of health");
});

test("no snapshot means the geometry half is unanswered, not answered wrongly", () => {
  const pkg = buildEvidencePackage({ region: region("skills", "Skills"), model: null });
  assert.equal(pkg.cause, "UNKNOWN");
  assert.equal(pkg.layout, null);
  assert.match(pkg.causeBasis, /no layout snapshot/);
  assert.ok(pkg.causeCandidates.includes("GEOMETRY"), "geometry is still a candidate when it could not be checked");
});

// -------------------------------------------------------------- the owner ----

test("the recommended properties are the terms that produced the position", () => {
  // Not suggestions. They come from the inspector's chain, so editing the node
  // that shows the symptom instead of the owner named here is provably the
  // compensating constant the authoring rules forbid.
  const pkg = build({ region: region("masthead", "Masthead", {}, { dx: 30 }) });
  assert.equal(pkg.cause, "GEOMETRY");
  const owners = pkg.recommendedProperties.filter((p) => p.owner).map((p) => `${p.owner}.${p.property}`);
  assert.ok(owners.includes("MainColumn.padding.left"), `expected the parent's padding, got ${owners.join(", ")}`);
  assert.ok(!owners.some((o) => o.startsWith("Masthead.")), "the symptom node is not the owner of its own x");
});

test("properties are offered only when the cause is geometry", () => {
  const pkg = build({
    region: region("skills", "Skills"),
    regionStats: { percent: 60 },
  });
  assert.equal(pkg.cause, "UNKNOWN");
  assert.deepEqual(pkg.recommendedProperties, [], "keeping the numbers is useful; presenting them as the fix is not");
});

test("hierarchy and children are capped, not dumped", () => {
  const pkg = build({ region: region("sidebar", "Sidebar", {}, { dx: 30 }) });
  assert.ok(pkg.hierarchy.length <= 4);
  assert.ok(pkg.children.listed.length <= 8);
  assert.equal(pkg.children.count, 8);
});

// ---------------------------------------------------------- boundedness -----

test("a package stays small — that is the whole point of it existing", () => {
  // 227 KB of snapshot answers this question too. The package is the same
  // answer at a fraction of the size, and if it ever stops being that, it has
  // stopped being worth having.
  const snapshotBytes = fs.statSync(FIXTURE).size;
  for (const name of ["Sidebar", "Skills", "Masthead", "Experience"]) {
    const pkg = build({
      region: region(name.toLowerCase(), name, {}, { dx: 20 }),
      regionStats: { percent: 30, classification: "MAJOR" },
      mismatch: { id: "x", severity: "MAJOR", component: "renderThing", rootCause: "y", source: "measured" },
      crops: ["output-diff.png", "reference-scaled.png"],
    });
    const bytes = JSON.stringify(pkg).length;
    assert.ok(bytes < 6000, `${name} package is ${bytes} bytes`);
    assert.ok(bytes < snapshotBytes / 20, `${name} package is not meaningfully smaller than the snapshot`);
  }
});

test("the summary is one line and leads with the cause", () => {
  const line = summarise(build({ region: region("skills", "Skills", {}, { dx: 30 }) }));
  assert.ok(!line.includes("\n"));
  assert.match(line, /^skills: GEOMETRY/);
});

test("a region without an id is refused rather than half-built", () => {
  assert.throws(() => buildEvidencePackage({ region: null }), TypeError);
  assert.throws(() => buildEvidencePackage({ region: { label: "no id" } }), TypeError);
});

test("displacement reports the two edges a reader can act on", () => {
  const skills = resolveNode(model, "Skills");
  const rect = regionToPageRect(boundsFor("Skills", { dx: 10, dy: -4 }), canvas);
  const d = displacement(skills, rect);
  assert.equal(d.deltaX, -10);
  assert.equal(d.deltaY, 4);
});
