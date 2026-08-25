#!/usr/bin/env node
/**
 * scripts/test/check-links.test.mjs — the two ways a link dies, and the
 * difference between them.
 *
 * Both acceptance runs shipped dead links, each by a different route, and the
 * distinction is the whole design of this tool:
 *
 *   navy-sidebar-cv    the data never recorded an href. Nothing was broken;
 *                      nobody said there was a link. A WARNING — whether a
 *                      given string should be clickable is a judgement.
 *   serif-headline-cv  the data recorded four hrefs and the Java drew the
 *                      values as text. A FAILURE — the contract was explicit.
 *
 * Conflating them would either nag on every phone number or stay silent on a
 * broken contract, so the exit code separates them: only the second fails.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "check-links.mjs");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gccl-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

/** A PDF carrying exactly these link targets, in the shape a render produces. */
function writePdf(file, targets) {
  const annots = targets
    .map(
      (t) =>
        `<</Type /Annot /Subtype /Link /Rect [0 0 1 1] /A <</Type /Action /S /URI /URI (${t}) >> >>`,
    )
    .join("\n");
  const body = zlib.deflateSync(Buffer.from(annots, "latin1"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from("%PDF-1.7\n1 0 obj\n<</Filter /FlateDecode>>\nstream\n", "latin1"),
      body,
      Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
    ]),
  );
}

/**
 * @param data      the data spec, or null to ship no spec at all
 * @param targets   the link targets present in the render, or null for no PDF
 */
function scenario({ label, data, targets }) {
  const root = path.join(tempDir(label), "graphcompose-flow");
  const project = path.join(root, "projects", "demo");
  const revision = path.join(project, "revisions", "revision-001");

  writeJson(path.join(root, "flow.config.json"), { schemaVersion: 1 });
  writeJson(path.join(project, "template-project.json"), {
    projectName: "demo",
    docKind: "cv",
    schemaVersion: 1,
  });
  fs.mkdirSync(revision, { recursive: true });
  if (data !== null) writeJson(path.join(revision, "cv-data.json"), data);
  if (targets !== null) writePdf(path.join(revision, "output.pdf"), targets);
  return { root, revision };
}

function runCli(root, extra = []) {
  const spawned = spawnSync(
    process.execPath,
    [CLI, "--project", "demo", "--revision", "revision-001", "--root", root, "--json", ...extra],
    { encoding: "utf8" },
  );
  return { status: spawned.status, json: JSON.parse(spawned.stdout), output: spawned.stdout };
}

test("a declared href that reached the render passes", () => {
  const s = scenario({
    label: "live",
    data: { contact: [{ value: "github.com/alexmorgan", href: "https://github.com/alexmorgan" }] },
    targets: ["https://github.com/alexmorgan"],
  });
  const { status, json } = runCli(s.root);
  assert.equal(status, 0);
  assert.equal(json.declaredCount, 1);
  assert.deepEqual(json.missing, []);
  assert.deepEqual(json.undeclared, [], "a value with an href sibling is not also a candidate");
});

test("a declared href absent from the render fails and names it", () => {
  // serif revisions 001-010: the href was in the data, the PDF had no target.
  const s = scenario({
    label: "dead",
    data: {
      contact: [
        { value: "alex@example.com", href: "mailto:alex@example.com" },
        { value: "github.com/alexmorgan", href: "https://github.com/alexmorgan" },
      ],
    },
    targets: ["mailto:alex@example.com"],
  });
  const { status, json } = runCli(s.root);
  assert.equal(status, 1, "a broken link contract must fail");
  assert.equal(json.missing.length, 1);
  assert.equal(json.missing[0].target, "https://github.com/alexmorgan");
  assert.match(json.missing[0].at, /contact\[1\]\.href/);
});

test("a link-shaped value with no href anywhere is a warning, not a failure", () => {
  // navy-sidebar-cv, as approved and published.
  const s = scenario({
    label: "undeclared",
    data: { contact: [{ label: "Email", value: "your.email@gmail.com" }, { value: "linkedin.com/in/yourname" }] },
    targets: [],
  });
  const { status, json } = runCli(s.root);
  assert.equal(status, 0, "the data never claimed these were links");
  assert.equal(json.undeclared.length, 2);
  assert.deepEqual(
    json.undeclared.map((u) => u.value).sort(),
    ["linkedin.com/in/yourname", "your.email@gmail.com"],
  );
});

test("a scheme-less href matches the absolute URL the renderer resolved it to", () => {
  const s = scenario({
    label: "scheme",
    data: { contact: [{ href: "linkedin.com/in/alexmorgan" }] },
    targets: ["https://www.linkedin.com/in/alexmorgan"],
  });
  assert.equal(runCli(s.root).status, 0);
});

test("plain prose that merely contains a dot is not mistaken for a link", () => {
  const s = scenario({
    label: "prose",
    data: {
      summary: "Senior engineer. Ten years in payments.",
      company: "Acme Inc.",
      phone: "+1 (555) 123-4567",
    },
    targets: [],
  });
  const { status, json } = runCli(s.root);
  assert.equal(status, 0);
  assert.deepEqual(json.undeclared, [], "a phone number and a sentence are not link candidates");
});

test("a list of targets under one key is judged item by item", () => {
  // A bare string cannot say what key it was filed under; the array has to
  // carry that down, or every `"links": [...]` shape goes unchecked.
  const s = scenario({
    label: "array",
    data: { portfolio: { url: ["https://example.com/one", "https://example.com/two"] } },
    targets: ["https://example.com/one"],
  });
  const { status, json } = runCli(s.root);
  assert.equal(status, 1);
  assert.equal(json.declaredCount, 2);
  assert.equal(json.missing.length, 1);
  assert.equal(json.missing[0].at, "portfolio.url[1]");
});

test("no render yet is not checked, and not a failure", () => {
  const s = scenario({ label: "nopdf", data: { contact: [{ href: "https://example.com" }] }, targets: null });
  const { status, json } = runCli(s.root);
  assert.equal(status, 0);
  assert.equal(json.checked, false);
  assert.match(json.skipped, /no output\.pdf/);
});

test("a project that ships its data inline has nothing to compare", () => {
  const s = scenario({ label: "nodata", data: null, targets: ["https://example.com"] });
  const { status, json } = runCli(s.root);
  assert.equal(status, 0);
  assert.equal(json.checked, false);
  assert.match(json.skipped, /no data spec/);
});

test("usage errors are usage errors", () => {
  const bad = spawnSync(process.execPath, [CLI, "--project", "demo"], { encoding: "utf8" });
  assert.equal(bad.status, 2);
});
