#!/usr/bin/env node
/**
 * scripts/test/layout-inspector.test.mjs — the inspector must not guess.
 *
 * Every number asserted here was measured by GraphCompose 2.2.1 during a real
 * render; the fixture is a byte copy of a revision's `layout-snapshot.json`
 * (see `fixtures/README.md`). That matters more than usual: ten files of
 * hand-authored "illustrative" geometry were deleted from this repository the
 * day the real snapshot writer landed, because they were being read as if they
 * were measurements. A test that pinned this inspector against invented numbers
 * would put that back one layer further down.
 *
 * The tests that matter most are the ones asserting the inspector *refuses* to
 * derive something. 109 of 247 nodes have a width no arithmetic over the file
 * recovers, and 16 have an x that matches no rule. The whole point of this tool
 * is to replace guessing with arithmetic, so a chain that quietly closes a gap
 * it cannot explain would be worse than no tool at all.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  LayoutSnapshotError,
  NodeQueryError,
  classify,
  contentBoxOf,
  explain,
  inspectNode,
  isRowParent,
  loadSnapshot,
  resolveNode,
  topOf,
} from "../lib/layout-inspector.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "layout.mjs");
const FIXTURE = path.join(repoRoot, "scripts", "test", "fixtures", "charcoal-gold-cv", "layout-snapshot.json");

const raw = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const model = loadSnapshot(raw);
const at = (selector) => resolveNode(model, selector);
const chain = (selector, coordinate) => explain(model, at(selector), coordinate);
const labels = (result) => result.terms.map((t) => `${t.label} ${t.value}`);

const cli = (...argv) => spawnSync(process.execPath, [CLI, ...argv], { encoding: "utf8", cwd: repoRoot });

/** `assert.throws` returns undefined, and every check here is about the error itself. */
function caught(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return assert.fail("expected a throw");
}

// ------------------------------------------------------------ the fixture ---

test("the fixture is the engine's own measurement, not a description of one", () => {
  assert.equal(raw.formatVersion, "2.0");
  assert.equal(raw.nodes.length, 248);
  assert.equal(raw.totalPages, 1);
  // Null on purpose: the published jar sets no Implementation-Version, so the
  // writer has nothing to read. Anything that starts depending on this value
  // has to get it from the project's pin instead.
  assert.equal(raw.graphComposeVersion, null);
});

// -------------------------------------------------------------- envelope ----

const ENVELOPE = path.join(repoRoot, "scripts", "test", "fixtures", "typography-snapshot", "layout-snapshot.json");

test("the 2.2.2 envelope and a pre-2.2.2 flat snapshot both load", () => {
  // GraphCompose 2.2.2 made the diagnostic sections opt-in and returns them in
  // an envelope, so `layoutSnapshot()` keeps returning byte-for-byte what it
  // always did and no consumer's committed baseline moves on an upgrade. Every
  // revision rendered before that holds the flat snapshot — real measurements,
  // and the only history this repository has. Refusing either would be a defect.
  const envelope = loadSnapshot(JSON.parse(fs.readFileSync(ENVELOPE, "utf8")));
  assert.ok(envelope.nodes.length > 0);
  assert.equal(envelope.formatVersion, "2.0", "the LAYOUT version is untouched by the envelope");
  assert.equal(envelope.diagnosticFormatVersion, "1.0", "the envelope carries its own, moving on its own schedule");
  assert.equal(envelope.hasTypography, true);

  assert.equal(model.formatVersion, "2.0");
  assert.equal(model.diagnosticFormatVersion, null, "a flat snapshot never had an envelope");
  assert.equal(model.hasTypography, false);
});

test("the default snapshot's version did not move, which is the whole point", () => {
  // If this ever reads 2.1, the opt-in split has been undone and every user's
  // baseline regenerates on a library upgrade.
  const raw = JSON.parse(fs.readFileSync(ENVELOPE, "utf8"));
  assert.equal(raw.layout.formatVersion, "2.0");
  assert.equal(raw.formatVersion, "1.0");
  assert.ok(!("typography" in raw.layout), "typography sits beside the layout, never inside it");
});

test("a family and its decoration are reported separately", () => {
  // They select the face together. The fixture carries the pair that proves it
  // matters: the same alias with and without the decoration it implies.
  const envelope = loadSnapshot(JSON.parse(fs.readFileSync(ENVELOPE, "utf8")));
  const trap = inspectNode(envelope, resolveNode(envelope, "TrapHeading")).typography[0];
  const honest = inspectNode(envelope, resolveNode(envelope, "HonestHeading")).typography[0];

  assert.equal(trap.declaredFont, "Helvetica-Bold");
  assert.equal(trap.resolvedFamily, "Helvetica");
  assert.equal(trap.decoration, "DEFAULT");
  assert.equal(trap.fontSubstituted, true, "naming the bold face and setting no decoration renders regular");

  assert.equal(honest.declaredFont, "Helvetica-Bold");
  assert.equal(honest.resolvedFamily, "Helvetica");
  assert.equal(honest.decoration, "BOLD");
  assert.equal(honest.fontSubstituted, false, "the same alias WITH its decoration really is bold — not a substitution");
});

// ------------------------------------------------------------------ load ----

test("a snapshot with no nodes array is refused, not read as empty", () => {
  // Five files under examples/ are exactly this shape — illustrative material
  // written before the renderer existed. Parsing as JSON proves nothing.
  assert.throws(() => loadSnapshot({ canvas: {}, formatVersion: "2.0" }), LayoutSnapshotError);
  assert.throws(() => loadSnapshot({ nodes: [], formatVersion: "2.0" }), /no `canvas`/);
  assert.throws(() => loadSnapshot(null), LayoutSnapshotError);
  assert.throws(() => loadSnapshot([]), LayoutSnapshotError);
});

test("a node missing the geometry every rule depends on fails at load, not mid-chain", () => {
  const canvas = { pageWidth: 100, pageHeight: 100, margin: { top: 0, right: 0, bottom: 0, left: 0 } };
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };
  const node = (over) => ({
    path: "A[0]",
    entityKind: "ContainerNode",
    parentPath: null,
    childIndex: 0,
    placementX: 0,
    placementY: 0,
    placementWidth: 10,
    placementHeight: 10,
    margin: zero,
    padding: zero,
    ...over,
  });
  assert.throws(() => loadSnapshot({ canvas, nodes: [node({ placementWidth: undefined })] }), /placementWidth/);
  assert.throws(() => loadSnapshot({ canvas, nodes: [node({ padding: { top: 0 } })] }), /padding\.right/);
  assert.throws(() => loadSnapshot({ canvas, nodes: [node(), node()] }), /duplicate node path/);
  assert.throws(
    () => loadSnapshot({ canvas, nodes: [node({ path: "B[0]", parentPath: "Missing[0]" })] }),
    /names a parent that is not in the file/,
  );
});

// -------------------------------------------------------------- selection ---

test("a node is found by the name a user would actually say", () => {
  assert.equal(at("Languages").path, "CharcoalGoldCv[0]/Body[0]/Sidebar[0]/Languages[5]");
  assert.equal(at("CharcoalGoldCv[0]/Body[0]/Sidebar[0]/Languages[5]").entityName, "Languages");
  assert.equal(at("Sidebar[0]/Languages[5]").entityName, "Languages");
  assert.equal(at("languages").entityName, "Languages");
});

test("an ambiguous name lists its candidates instead of picking one", () => {
  // Six nodes are called SvgIcon. Answering about whichever came first would be
  // a confident answer about the wrong icon.
  const err = caught(() => at("SvgIcon"));
  assert.ok(err instanceof NodeQueryError);
  assert.match(err.message, /matches 6 nodes by name/);
  assert.equal(err.candidates.length, 6);
});

test("an unknown name fails rather than returning the nearest thing", () => {
  const err = caught(() => at("Langauges"));
  assert.ok(err instanceof NodeQueryError);
  assert.match(err.message, /no node named/);
});

// ---------------------------------------------------------------- inspect ---

test("inspect reports the placement box the engine measured", () => {
  const view = inspectNode(model, at("Languages"));
  assert.deepEqual(view.placement, { x: 17, y: 187.229, width: 156.31, height: 91.6, top: 278.829, right: 173.31 });
  assert.deepEqual(view.margin, { top: 17, right: 0, bottom: 0, left: 0 });
  assert.equal(view.parent.name, "Sidebar");
  assert.equal(view.childCount, 5);
  assert.equal(view.laysOutAs, "column");
  assert.deepEqual(view.pages, { start: 0, end: 0, spansPages: false });
});

test("the content box is computed from padding, never read from contentWidth", () => {
  // The field named `contentWidth` equals `placementWidth` on all 248 nodes —
  // Sidebar is 190.31 wide with 17 of padding a side and reports 190.31. The
  // box its children actually sit in is 156.31, and Align starts at exactly 17.
  const sidebar = at("Sidebar");
  assert.equal(sidebar.contentWidth, sidebar.placementWidth, "precondition: the field is not the content box");
  const box = contentBoxOf(sidebar);
  assert.equal(box.x, 17);
  assert.equal(box.width, 156.31);
  assert.equal(inspectNode(model, sidebar).content.width, 156.31);

  const align = model.children.get(sidebar.path)[0];
  assert.equal(align.placementX, box.x, "the first child sits at the computed content x");
  assert.equal(align.placementWidth, box.width);
});

test("corrupting contentWidth changes nothing — the field is not an input", () => {
  const tampered = structuredClone(raw);
  for (const node of tampered.nodes) {
    node.contentWidth = -1;
    node.contentHeight = -1;
  }
  const other = loadSnapshot(tampered);
  assert.deepEqual(
    inspectNode(other, resolveNode(other, "Sidebar")).content,
    inspectNode(model, at("Sidebar")).content,
  );
  assert.deepEqual(classify(other), classify(model));
});

test("y is bottom-up, and inspect says so in the numbers", () => {
  // Sidebar reports y 44.209 and is at the TOP of the page: its top edge is one
  // page height up. Reading y as a downward offset inverts every vertical fix.
  const sidebar = at("Sidebar");
  assert.equal(sidebar.placementY, 44.209);
  assert.ok(Math.abs(topOf(sidebar) - 841.889) < 0.002);
  assert.equal(model.canvas.pageHeight, 841.89);

  const kids = model.children.get(sidebar.path);
  assert.ok(kids[0].placementY > kids[1].placementY, "later siblings sit at a lower y");
});

test("inspect can list children and ancestors without returning the snapshot", () => {
  const view = inspectNode(model, at("Languages"), { children: true, ancestors: true });
  assert.deepEqual(
    view.children.map((c) => c.name),
    ["Heading_LANGUAGES", "Language_0Stack", "Language_1Stack", "Language_2Stack", "Language_3Stack"],
  );
  assert.deepEqual(
    view.ancestors.map((a) => a.name),
    ["CharcoalGoldCv", "Body", "Sidebar"],
  );
});

test("a row is recognised from sibling geometry, since the file records no direction", () => {
  assert.equal(isRowParent(model, at("Body")), true, "RowNode is taken at its word");
  assert.equal(isRowParent(model, at("Sidebar")), false);
  // Inferred: a LayerStack whose children share a top edge and differ in x.
  assert.equal(isRowParent(model, at("MarkerCap_0")), true);
});

// ---------------------------------------------------- explain: the chains ---

test("the additive chain names every owner of an offset", () => {
  // This is the derivation the whole track exists to produce. Two nodes own the
  // 26: neither of them is the node that shows it.
  const result = chain("HeadingText_CONTACT", "x");
  assert.equal(result.value, 26);
  assert.equal(result.rule, "flowStart");
  assert.equal(result.exact, true);
  assert.deepEqual(labels(result), [
    "canvas.margin.left 0",
    "Sidebar.padding.left 17",
    "Heading_CONTACT.padding.left 9",
  ]);
});

test("explain y works in top edges and converts, so the arithmetic is checkable", () => {
  const result = chain("Languages", "y");
  assert.equal(result.value, 187.229);
  assert.equal(result.rule, "flowAfterSibling");
  assert.equal(result.exact, true);
  assert.deepEqual(labels(result), [
    "Divider_AfterSkills.y 295.829",
    "Languages.margin.top -17",
    "Languages.height -91.6",
  ]);
});

test("the first child of a column is pinned to the parent content top", () => {
  // This one carries no author-given name, so it is addressed by path suffix.
  const result = chain("Align[0]", "y");
  assert.equal(result.rule, "contentTop");
  assert.equal(result.exact, true);
  assert.ok(labels(result).includes("Sidebar.padding.top -24.3"));
});

test("explain width derives a fill and names the padding it loses", () => {
  const result = chain("Languages", "width");
  assert.equal(result.value, 156.31);
  assert.equal(result.rule, "fillsParentContent");
  assert.equal(result.exact, true);
  assert.deepEqual(labels(result), [
    "Sidebar.width 190.31",
    "Sidebar.padding.left -17",
    "Sidebar.padding.right -17",
  ]);
});

test("a container's height is its children, and every child is named", () => {
  const result = chain("Languages", "height");
  assert.equal(result.value, 91.6);
  assert.equal(result.rule, "childrenPlusPadding");
  assert.equal(result.exact, true);
  // Its own padding.top anchors the chain, then one term per child.
  assert.equal(result.terms.length, 6);
  assert.equal(result.terms[0].label, "Languages.padding.top");
});

test("a row's height is its tallest column, not the sum", () => {
  const result = chain("Body", "height");
  assert.equal(result.rule, "tallestChildPlusPadding");
  assert.equal(result.exact, true);
  assert.equal(result.terms.length, 2, "padding.top plus the tallest column — not one term per child");
});

test("contentX and contentY are derived off placement, since the file has neither", () => {
  const x = chain("Sidebar", "contentX");
  assert.equal(x.value, 17);
  assert.equal(x.terms.at(-1).label, "Sidebar.padding.left");
  assert.equal(x.terms.at(-1).value, 17);

  const y = chain("Sidebar", "contentY");
  assert.equal(y.value, contentBoxOf(at("Sidebar")).y);
});

test("an unknown coordinate is refused rather than silently answered", () => {
  assert.throws(() => chain("Languages", "left"), NodeQueryError);
  assert.throws(() => chain("Languages", "contentWidth"), /expected one of/);
});

// ------------------------------------------ explain: refusing to derive ------

test("an intrinsic width reports that it is not derivable, and why", () => {
  // A heading is as wide as its text. No arithmetic over this file produces
  // 56.6, and a chain that appeared to would be an invention.
  const result = chain("Heading_CONTACT", "width");
  assert.equal(result.value, 56.6);
  assert.equal(result.derivable, false);
  assert.equal(result.terms.length, 0);
  assert.match(result.note, /measured from content/);
});

test("a leaf's height is not derivable either", () => {
  const result = chain("HeadingText_CONTACT", "height");
  assert.equal(result.derivable, false);
  assert.match(result.note, /leaf node is as tall as what it draws/);
});

test("an x no rule explains reports the residual instead of absorbing it", () => {
  // LanguageLevel_0..3 all start at 73.271 however wide their siblings are —
  // a weighted row column, and the snapshot records no weights. The earlier
  // shape of this code returned `LanguageLevel_0.x 73.271` as a one-term
  // "chain": it summed correctly and explained nothing.
  const result = chain("LanguageLevel_0", "x");
  assert.equal(result.value, 73.271);
  assert.equal(result.exact, false);
  assert.equal(result.rule, "rowFlow+unattributed");
  assert.equal(result.residual, 27.852);
  assert.ok(!result.terms.some((t) => t.label === "LanguageLevel_0.x"), "the node must not explain itself");
  assert.match(result.note, /weighted row column/);
});

test("every chain that claims to be exact actually adds up", () => {
  // The guard against a rule that looks right and is off by a padding: replay
  // the arithmetic for all 247 non-root nodes rather than trusting `exact`.
  let checked = 0;
  for (const node of model.nodes) {
    if (node.parentPath == null) continue;
    for (const coordinate of ["x", "y", "width", "height"]) {
      const result = explain(model, node, coordinate);
      if (!result.derivable || !result.exact) continue;
      const total = result.terms.reduce((sum, t) => sum + t.value, 0);
      const actual = { x: node.placementX, y: node.placementY, width: node.placementWidth, height: node.placementHeight }[coordinate];
      assert.ok(Math.abs(total - actual) <= 0.002, `${node.path}.${coordinate}: chain sums to ${total}, measured ${actual}`);
      checked += 1;
    }
  }
  // 231 x + 247 y + 138 width + 133 height, the exact-and-derivable half of the
  // classification below. Pinned as a number so a rule that stops firing cannot
  // pass this test by having less to check.
  assert.equal(checked, 749);
});

// --------------------------------------------------------------- coverage ---

test("the rule catalogue still explains what it explained when it was written", () => {
  // Measured before the rules were written; pinned so a later change that
  // quietly stops explaining forty nodes turns this red instead of degrading
  // back into guessing. Roots are excluded, so the 134 container heights the
  // census counted appear here as 133.
  assert.deepEqual(classify(model), {
    x: { flowStart: 206, rowFlow: 14, rightAligned: 10, centred: 1, unresolved: 16 },
    y: { contentTop: 172, flowAfterSibling: 73, verticallyCentred: 2 },
    width: { fillsParentContent: 138, intrinsic: 109 },
    height: { childrenPlusPadding: 103, tallestChildPlusPadding: 30, intrinsic: 114 },
  });
});

// -------------------------------------------------------------------- CLI ---

test("the CLI answers, and --json is the same answer for an agent", () => {
  const human = cli("inspect", "Languages", "--snapshot", FIXTURE);
  assert.equal(human.status, 0);
  assert.match(human.stdout, /placement x 17 {2}y 187\.229/);
  assert.match(human.stdout, /y is bottom-up/);

  const json = cli("explain", "HeadingText_CONTACT", "x", "--snapshot", FIXTURE, "--json");
  assert.equal(json.status, 0);
  const parsed = JSON.parse(json.stdout);
  assert.equal(parsed.value, 26);
  assert.equal(parsed.exact, true);
  assert.equal(parsed.path, "CharcoalGoldCv[0]/Body[0]/Sidebar[0]/Contact[1]/Heading_CONTACT[0]/HeadingText_CONTACT[0]");
});

test("the CLI never prints the whole snapshot", () => {
  // The one failure mode that would defeat the purpose: 227 KB into a context
  // window. Every output here is one node's worth.
  for (const argv of [
    ["inspect", "Sidebar", "--snapshot", FIXTURE, "--children", "--ancestors"],
    ["explain", "Languages", "height", "--snapshot", FIXTURE, "--json"],
  ]) {
    const result = cli(...argv);
    assert.equal(result.status, 0);
    assert.ok(result.stdout.length < 4000, `${argv[0]} printed ${result.stdout.length} bytes`);
  }
});

test("the CLI's exit codes distinguish the four ways it can decline", () => {
  assert.equal(cli("inspect", "Languages", "--snapshot", FIXTURE).status, 0);
  assert.equal(cli("explain", "Languages", "--snapshot", FIXTURE).status, 2, "no coordinate is usage");
  assert.equal(cli("wibble", "Languages", "--snapshot", FIXTURE).status, 2, "unknown command is usage");
  assert.equal(cli("inspect", "Nope", "--snapshot", FIXTURE).status, 3, "no such node");
  assert.equal(cli("inspect", "Languages", "--snapshot", "no/such/file.json").status, 4, "no snapshot");
});

test("an illustrative snapshot is refused with a message that says which kind of file it is", () => {
  const bogus = path.join(repoRoot, "scripts", "test", "fixtures", "not-a-snapshot.json");
  fs.writeFileSync(bogus, JSON.stringify({ formatVersion: "1.0", pages: [] }));
  try {
    const result = cli("inspect", "Anything", "--snapshot", bogus);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not an engine-written layout snapshot/);
  } finally {
    fs.rmSync(bogus, { force: true });
  }
});
