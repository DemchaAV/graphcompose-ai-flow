#!/usr/bin/env node
/**
 * scripts/test/layout-doctor.test.mjs — findings worth reading, and silence
 * where there is nothing to say.
 *
 * This repository has already shipped one check that scanned too broadly and
 * had to be rewritten, and the census behind `check-structural-smells.mjs`
 * found twenty-one groups a naive rule would have flagged on its first run.
 * A maintainability check that cries wolf is switched off, and then it protects
 * nothing at all — so the tests that matter most here are the ones asserting it
 * stays quiet.
 *
 * Both committed fixtures are real engine renders. `charcoal-gold-cv` is an
 * approved 248-node CV and is the calibration corpus; `layout-diff-pair` is an
 * eight-node document with no repeated geometry, and is the silence case.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  NEGATIVE_INSET_THRESHOLD,
  SHARED_INSET_THRESHOLD,
  diagnose,
  impact,
} from "../lib/layout-doctor.mjs";
import { loadSnapshot, resolveNode } from "../lib/layout-inspector.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "layout.mjs");
const CV = path.join(repoRoot, "scripts", "test", "fixtures", "charcoal-gold-cv", "layout-snapshot.json");
const CLEAN = path.join(repoRoot, "scripts", "test", "fixtures", "layout-diff-pair", "before", "layout-snapshot.json");

const read = (file) => loadSnapshot(JSON.parse(fs.readFileSync(file, "utf8")));
const cv = read(CV);
const clean = read(CLEAN);
const cli = (...argv) => spawnSync(process.execPath, [CLI, ...argv], { encoding: "utf8", cwd: repoRoot });

// ------------------------------------------------------------ calibration ---

test("the calibration corpus produces the findings the thresholds were set from", () => {
  // Pinned as a number: a rule change that quietly starts reporting forty
  // findings on this document has become noise, and nothing else would say so.
  const { findings, examined } = diagnose(cv);
  assert.equal(examined, 134);
  assert.equal(findings.length, 7, "thirteen raw groups, seven after folding repeated components");
  assert.ok(findings.every((f) => f.kind === "repeated-sibling-inset"));
});

test("the loudest finding comes first, because it is the one worth doing", () => {
  const [first] = diagnose(cv).findings;
  assert.equal(first.parent.label, "Skills");
  assert.equal(first.property, "margin.bottom");
  assert.equal(first.count, 10);
  assert.equal(first.siblings, 11);
  assert.equal(first.suggestion, "spacing(...) on the parent");
});

test("a document with nothing to report gets silence, not a shrug", () => {
  // The single most important test here. A check that always finds something
  // teaches its reader to stop reading it.
  assert.deepEqual(diagnose(clean).findings, []);
});

test("a zero inset is never a finding", () => {
  // The specific false positive the source check's census counted twenty-one
  // of: neutralising a default is not a statement of shared geometry.
  for (const finding of diagnose(cv).findings) {
    assert.notEqual(finding.value, 0);
  }
});

test("two siblings is the threshold, and one is never reported", () => {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };
  const node = (over) => ({
    path: "R[0]",
    entityKind: "SectionNode",
    parentPath: null,
    childIndex: 0,
    placementX: 0,
    placementY: 0,
    placementWidth: 100,
    placementHeight: 10,
    startPage: 0,
    endPage: 0,
    margin: { ...zero },
    padding: { ...zero },
    ...over,
  });
  const canvas = { pageWidth: 100, pageHeight: 100, margin: { ...zero } };
  const doc = (marginBottoms) => ({
    canvas,
    totalPages: 1,
    nodes: [
      node({ entityName: "Parent" }),
      ...marginBottoms.map((bottom, index) =>
        node({
          path: `R[0]/C${index}[${index}]`,
          entityName: `C${index}`,
          parentPath: "R[0]",
          childIndex: index,
          placementY: 50 - index * 10,
          margin: { ...zero, bottom },
        }),
      ),
    ],
  });

  assert.equal(SHARED_INSET_THRESHOLD, 2);
  assert.equal(diagnose(loadSnapshot(doc([6, 4, 3]))).findings.length, 0, "three different values share nothing");
  assert.equal(diagnose(loadSnapshot(doc([6, 6, 3]))).findings.length, 1, "two sharers is the pattern");
});

test("negative insets cluster, and one alone is a deliberate exception", () => {
  assert.equal(NEGATIVE_INSET_THRESHOLD, 2);
  const zero = { top: 0, right: 0, bottom: 0, left: 0 };
  const base = {
    entityKind: "SectionNode",
    childIndex: 0,
    placementX: 0,
    placementY: 0,
    placementWidth: 100,
    placementHeight: 10,
    startPage: 0,
    endPage: 0,
    margin: { ...zero },
    padding: { ...zero },
  };
  const doc = (negatives) => ({
    canvas: { pageWidth: 100, pageHeight: 100, margin: { ...zero } },
    totalPages: 1,
    nodes: [
      { ...base, path: "R[0]", entityName: "Parent", parentPath: null },
      ...negatives.map((left, index) => ({
        ...base,
        path: `R[0]/C${index}[${index}]`,
        entityName: `C${index}`,
        parentPath: "R[0]",
        childIndex: index,
        margin: { ...zero, left },
      })),
    ],
  });

  const one = diagnose(loadSnapshot(doc([-4, 0]))).findings.filter((f) => f.kind === "negative-inset-cluster");
  assert.deepEqual(one, [], "a single negative inset is a local decision, not a smell");

  const cluster = diagnose(loadSnapshot(doc([-4, -6]))).findings.filter((f) => f.kind === "negative-inset-cluster");
  assert.equal(cluster.length, 1);
  assert.equal(cluster[0].count, 2);
  assert.match(cluster[0].detail, /structure above it is wrong/);
});

test("the corpus has no negative insets, so that rule is silent on it", () => {
  // Recorded so a future reader knows the rule was exercised against real data
  // and found nothing, rather than never having run.
  assert.equal(diagnose(cv).findings.filter((f) => f.kind === "negative-inset-cluster").length, 0);
});

// ------------------------------------------------------- what it claims ------

test("a finding names the parent, the children and what to put it on instead", () => {
  // The item-14 shape: parent, children, values, suggestion. A finding that
  // named only a count would leave the reader to find the nodes themselves.
  const [first] = diagnose(cv).findings;
  assert.ok(first.parent.path.length > 0);
  assert.equal(first.children.length, first.count);
  assert.ok(first.children.every((child) => typeof child.path === "string"));
  assert.match(first.detail, /each carry margin\.bottom = 7\.24/);
  assert.match(first.detail, /next child somebody adds/);
});

test("spacing is suggested only when the sharers are effectively all the children", () => {
  // The correction the manual pass forced. `spacing(...)` applies to every gap in
  // the parent, so suggesting it for four of six alternating children would tell an
  // author to make a change that moves the page.
  const findings = diagnose(cv).findings;
  const nearlyAll = findings.filter((f) => f.count >= f.siblings - 1);
  const partial = findings.filter((f) => f.count < f.siblings - 1);

  assert.ok(nearlyAll.length > 0 && partial.length > 0, "the corpus has both shapes");
  assert.ok(nearlyAll.every((f) => f.suggestion === "spacing(...) on the parent"));
  assert.ok(partial.every((f) => f.suggestion.startsWith("one named constant")));
  assert.ok(partial.every((f) => f.suggestion.includes("would add the gap between the other children")));
});

test("one component instantiated many times is one finding, not many", () => {
  // Six of the thirteen raw groups were the same shape in AchievementText_0/1/2
  // and CertificationText_0/1/2. That is one component and one fix; printing it
  // six times is how a list stops being read.
  const folded = diagnose(cv).findings.filter((f) => f.repeatedAcross);
  assert.ok(folded.length > 0);
  const six = folded.find((f) => f.repeatedAcross.length === 6);
  assert.ok(six, "the six *Text_N components fold into one entry");
  assert.equal(six.property, "margin.bottom");
  assert.equal(six.value, 2);
  assert.match(six.detail, /One component, built once and instantiated repeatedly/);
});

test("a trailing gap suggests spacing; a side inset suggests the parent's padding", () => {
  // Naming the wrong one sends an author to write the thing that does not
  // compose — `spacing` cannot express a left inset, and padding cannot express
  // a gap between items.
  const findings = diagnose(cv).findings;
  const vertical = findings.filter(
    (f) => (f.property === "margin.bottom" || f.property === "margin.top") && f.count >= f.siblings - 1,
  );
  assert.ok(vertical.length > 0);
  assert.ok(vertical.every((f) => f.suggestion === "spacing(...) on the parent"));

  const horizontal = findings.filter((f) => f.property?.endsWith(".left") || f.property?.endsWith(".right"));
  assert.ok(horizontal.every((f) => f.suggestion.startsWith("padding.")));
});

test("scoping limits the walk to one subtree", () => {
  const scoped = diagnose(cv, { scope: resolveNode(cv, "Skills") });
  assert.ok(scoped.findings.length >= 1);
  assert.ok(scoped.findings.every((f) => f.parent.path.includes("Skills")));
  assert.ok(scoped.examined < diagnose(cv).examined);
});

// ------------------------------------------------------------- impact -------

test("impact separates children, deeper descendants and what follows in the flow", () => {
  // Three different reasons a node moves, and three different fixes. Collapsing
  // them into one list would lose which is which.
  const result = impact(cv, resolveNode(cv, "Skills"));
  assert.equal(result.directly.length, 11);
  assert.ok(result.transitively.length > result.directly.length);
  assert.ok(result.siblingsAfter.length > 0);
  assert.ok(result.siblingsAfter.every((s) => !result.directly.some((d) => d.path === s.path)));
});

test("impact reports what it cannot reach, so the blast radius has a denominator", () => {
  const result = impact(cv, resolveNode(cv, "Skills"));
  assert.ok(result.unaffectedCount > 0);
  assert.ok(result.unaffectedCount < cv.nodes.length);
});

test("a leaf reaches only what follows it", () => {
  const result = impact(cv, resolveNode(cv, "HeadingText_SKILLS"));
  assert.deepEqual(result.directly, []);
  assert.deepEqual(result.transitively, []);
});

// --------------------------------------------------------------- CLI --------

test("the CLI prints the findings and says they are not rendering defects", () => {
  const result = cli("doctor", "--snapshot", CV);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Skills {2}— {2}repeated-sibling-inset/);
  assert.match(result.stdout, /10 of 11 children carry margin\.bottom = 7\.24/);
  assert.match(result.stdout, /spacing\(\.\.\.\) on the parent/);
  assert.match(result.stdout, /not rendering defects/);
  assert.match(result.stdout, /disagree by design/, "the reader must know why this and the source check differ");
});

test("the CLI says nothing found when nothing is found", () => {
  const result = cli("doctor", "--snapshot", CLEAN);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Nothing to report/);
});

test("doctor is evidence: exit 0 whether or not it finds anything", () => {
  // The same contract check-structural-smells has. A maintainability heuristic
  // that blocked the loop would be worse than the guessing it replaces.
  assert.equal(cli("doctor", "--snapshot", CV).status, 0);
  assert.equal(cli("doctor", "--snapshot", CLEAN).status, 0);
});

test("impact refuses to predict the page, and says so", () => {
  const result = cli("impact", "Skills", "--snapshot", CV);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Structural reach only/);
  assert.match(result.stdout, /needs a re-render/);
});

test("the CLI refuses arguments it cannot work from", () => {
  assert.equal(cli("doctor", "Skills", "--snapshot", CV).status, 2, "doctor takes no node");
  assert.equal(cli("impact", "--snapshot", CV).status, 2, "impact needs one");
  assert.equal(cli("impact", "Nope", "--snapshot", CV).status, 3, "no such node");
});
