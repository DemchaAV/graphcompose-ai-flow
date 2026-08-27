#!/usr/bin/env node
/**
 * scripts/test/java-outline.test.mjs — reading one method out of a template
 * instead of the file around it.
 *
 * Measured over one create run: `sed` returned 30.3k tokens across 17 calls and
 * `cat` 17.7k across 18, together more than half of everything the model read
 * back from a tool and more than twice what all nine deterministic tools of the
 * harness returned across ninety calls. None of it was diffing or measuring. It
 * was slicing a 1,233-line Java file to find one method, because the only way
 * to ask for it was to guess a line range.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { constants, declaredType, extract, methodDiff, methods } from "../lib/java-outline.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "source.mjs");

const SAMPLE = `package com.example;

/** A template. */
public final class DemoTemplate {

    private static final double LABEL_SIZE = 8.65;
    private static final String TITLE = "a } brace in a string";

    private record IconAsset(String name, double size) {
    }

    /**
     * The masthead.
     *
     * <p>Why it is 8.65 and not 8.5.</p>
     */
    private void renderMasthead(SectionBuilder section) {
        if (section != null) {
            section.addParagraph(p -> p.text("}"));
        }
    }

    private void renderBody(SectionBuilder section) {
        section.addParagraph(p -> p.text("body"));
    }
}
`;

test("every method is found, and a record is not one of them", () => {
  const found = methods(SAMPLE).map((m) => m.name);
  assert.deepEqual(found, ["renderMasthead", "renderBody"]);
});

test("a method's range is its own braces, not the ones inside its strings", () => {
  const masthead = methods(SAMPLE).find((m) => m.name === "renderMasthead");
  assert.equal(masthead.balanced, true);

  const body = SAMPLE.split("\n").slice(masthead.line - 1, masthead.endLine).join("\n");
  assert.match(body, /renderMasthead/);
  assert.doesNotMatch(body, /renderBody/, "the cut ran past the method it was asked for");
});

test("a symbol comes back with the Javadoc that says why it is what it is", () => {
  const cut = extract(SAMPLE, "renderMasthead");
  assert.match(cut.text, /Why it is 8\.65 and not 8\.5/);
  assert.match(cut.text, /private void renderMasthead/);
  // The reason is the point: a method read without it invites the next edit to
  // undo the measurement that set the number.
  assert.ok(cut.line < methods(SAMPLE).find((m) => m.name === "renderMasthead").line);
});

test("an unclosed method is reported as unbalanced rather than cut off silently", () => {
  const truncated = "class A {\n    void broken() {\n        if (x) {\n";
  const [only] = methods(truncated);
  assert.equal(only.name, "broken");
  assert.equal(only.balanced, false);
});

test("the constants a correction edits are listed with their lines", () => {
  const found = constants(SAMPLE);
  const label = found.find((c) => c.name === "LABEL_SIZE");
  assert.ok(label, "LABEL_SIZE was not found");
  assert.equal(label.value, "8.65");
  assert.equal(label.type, "double");
  assert.equal(SAMPLE.split("\n")[label.line - 1].includes("LABEL_SIZE"), true);
});

test("the declared type is named, so a caller need not open the file for it", () => {
  assert.equal(declaredType(SAMPLE), "DemoTemplate");
});

test("an unknown symbol names what there is instead of failing blankly", () => {
  // In a temp directory, not in fixtures/: the Codex adapter test copies this
  // tree while the suite runs, and a file that appears in its readdir and is
  // gone by the copy fails that test instead of this one.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gcsrc-"));
  const file = path.join(dir, "outline-sample.java");
  fs.writeFileSync(file, SAMPLE, "utf8");
  try {
    const run = spawnSync(process.execPath, [CLI, "symbol", "renderNothing", "--file", file], {
      encoding: "utf8",
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Declared: renderMasthead, renderBody/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an edit and a rewrite are told apart by how much stopped being the same", () => {
  // Two failures share this missing fact: a pass that hit a write conflict and
  // regenerated 1,103 lines, and a revision that replaced the page's whole
  // construction and was recorded as another visual change. On disk both look
  // like any other pass.
  const edited = SAMPLE.replace('p.text("body")', 'p.text("body text")');
  const oneMethod = methodDiff(SAMPLE, edited);

  assert.deepEqual(oneMethod.changed, ["renderBody"]);
  assert.deepEqual(oneMethod.added, []);
  assert.deepEqual(oneMethod.removed, []);
  assert.equal(oneMethod.touchedShare, 0.5, "one of two methods is half of them");
});

test("a rewrite scores against the union, so dropping methods does not hide it", () => {
  const rewritten = `package com.example;

public final class DemoTemplate {

    private void renderEverythingDifferently(SectionBuilder section) {
        section.addTable(t -> t.addRow());
    }
}
`;
  const diff = methodDiff(SAMPLE, rewritten);

  assert.deepEqual(diff.removed.sort(), ["renderBody", "renderMasthead"]);
  assert.deepEqual(diff.added, ["renderEverythingDifferently"]);
  assert.deepEqual(diff.unchanged, []);
  assert.equal(diff.touchedShare, 1, "a template with nothing in common scored under 100%");
});

test("a pass that changed nothing says so, rather than reporting a small number", () => {
  const diff = methodDiff(SAMPLE, SAMPLE);
  assert.equal(diff.touchedShare, 0);
  assert.equal(diff.unchanged.length, 2);
});

test("outline costs a fraction of the file it describes", () => {
  // The whole point. Against the largest template in examples/.
  const template = path.join(
    repoRoot, "examples", "charcoal-gold-cv", "revisions", "revision-009", "generated-template.java",
  );
  if (!fs.existsSync(template)) return;

  const run = spawnSync(process.execPath, [CLI, "outline", "--file", template, "--json"], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);

  const outline = JSON.parse(run.stdout);
  assert.ok(outline.methods.length > 10, "a 1,000-line template with ten methods is not this one");
  assert.ok(
    outline.methods.some((m) => m.name.startsWith("render")),
    "no render method — the harness's own naming rule is one per visible region",
  );
  assert.ok(
    run.stdout.length * 4 < fs.statSync(template).size,
    `the outline is ${run.stdout.length} bytes against a ${fs.statSync(template).size}-byte file`,
  );
});
