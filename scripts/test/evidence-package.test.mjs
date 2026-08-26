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
  OWNER_MATCH_FLOOR,
  buildEvidencePackage,
  classifyCause,
  displacement,
  regionOwner,
  regionToPageRect,
  summarise,
} from "../lib/evidence-package.mjs";
import { loadSnapshot, resolveNode, topOf } from "../lib/layout-inspector.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURE = path.join(repoRoot, "scripts", "test", "fixtures", "charcoal-gold-cv", "layout-snapshot.json");
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

test("TYPOGRAPHY, PAINT and CONTENT are never assigned automatically", () => {
  // The guard against the obvious future "improvement". Nothing deterministic
  // separates them yet, so anything assigning one would be guessing.
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
  assert.ok(!causes.has("TYPOGRAPHY"));
  assert.ok(!causes.has("PAINT"));
  assert.ok(!causes.has("CONTENT"));
  assert.deepEqual([...causes].sort(), ["ASSET", "GEOMETRY", "UNKNOWN"]);
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
