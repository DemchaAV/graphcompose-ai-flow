#!/usr/bin/env node
/**
 * scripts/test/document-integrity.test.mjs — a multi-page document is whole.
 *
 * The properties this covers are the ones a pixel diff scores as almost
 * nothing: a page that reads "Page 1 of 1" when there are three, a flowing
 * template whose example data never once crossed a page break, a render whose
 * page count disagrees with the analysis that planned it. Each is a functional
 * defect worth perhaps forty grey pixels, and the last is worth zero, because
 * the reference never had the page that went missing.
 *
 * The matcher is tested separately from the gate. Text extracted from a subset
 * font is not clean — a real CV had "Software" come back as "So[ware" and
 * "Optimized" as "Op?mized" — and getting the matcher wrong is how a check
 * starts reporting defects against documents that are fine, which is how it
 * stops being read.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { contentStrings, normalizeText, valueAppears } from "../lib/data-spec.mjs";
import { findFooterOverlaps } from "../lib/footer-overlap.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "check-document-integrity.mjs");

// --- the presence matcher -----------------------------------------------------

test("a letter-spaced heading still counts as present", () => {
  // A design device, reported faithfully by the extractor.
  const document = normalizeText("S O F T W A R E   E N G I N E E R");
  assert.equal(valueAppears("Software Engineer", document), true);
});

test("a line-wrapped sentence still counts as present", () => {
  const document = normalizeText("Designed and developed microservices using Java,\nSpring Boot,\nand Docker");
  assert.equal(valueAppears("Designed and developed microservices using Java, Spring Boot, and Docker", document), true);
});

test("a ligature the font did not map back still counts as present", () => {
  // Measured: every word a stricter check called missing had a "ti" or "tf"
  // pair, and each extracted with a replacement character in its place.
  const document = normalizeText("Op?mized database queries · pla?orm · cer?fied · TechSolu?ons");
  for (const value of ["Optimized database queries", "platform", "certified", "TechSolutions"]) {
    assert.equal(valueAppears(value, document), true, `${value} was reported missing`);
  }
});

test("content that is genuinely absent is reported absent", () => {
  // The whole point: a line item that fell off the end shares no words with the
  // page it fell off.
  const document = normalizeText("Line item 1 · Line item 2 · Consulting retainer");
  assert.equal(valueAppears("Emergency callout surcharge", document), false);
  assert.equal(valueAppears("Line item 2", document), true);
});

test("a short value is matched whole rather than by words", () => {
  const document = normalizeText("Total 1,240.00 EUR");
  assert.equal(valueAppears("EUR", document), true);
  assert.equal(valueAppears("GBP", document), false);
});

// --- what counts as content --------------------------------------------------

test("targets, asset paths and colours are not content to look for", () => {
  const values = contentStrings({
    name: "Alexander Morgan",
    href: "https://example.com/in/alexmorgan",
    avatarImage: "assets/icons/avatar.png",
    accent: "#1b2a4a",
    format: "svg",
    summary: "Ten years in payments infrastructure",
  }).map((v) => v.at);

  assert.deepEqual(values.sort(), ["name", "summary"]);
});

test("a suffixed target key is not content to look for either", () => {
  // The same fix, seen from the other side: a href is an input to the render,
  // not text it draws, so demanding it appear reports a defect against a
  // document that is fine.
  const values = contentStrings({
    email: "billing@example.com",
    emailHref: "mailto:billing@example.com",
    websiteUrl: "https://example.com/pay",
    description: "Consulting retainer",
  }).map((v) => v.at);
  assert.deepEqual(values.sort(), ["description", "email"]);
});

test("nested arrays keep a readable path, so a finding says which row", () => {
  const values = contentStrings({ items: [{ description: "Consulting retainer" }] });
  assert.equal(values[0].at, "items[0].description");
});

// --- the footer must be under the body, not through it ------------------------

/** Line boxes as the extractor reports them: points, y from the page top. */
const line = (text, top, height = 8) => ({ text, top, height, x: 50, width: 200 });

test("a body line crossing into the footer is a defect, with the amount", () => {
  // Reproduced in a real run by removing one bottom margin: the last row of a
  // continuation page ran 6.1 pt into "Page 1 of 3". Page one showed nothing,
  // because its content ends well above the fold - which is why a single-page
  // render is structurally unable to reveal this.
  const findings = findFooterOverlaps([[
    line("Line item 29", 700),
    line("Nullam tempor elit egestas neque.", 812),
    line("Page 1 of 3", 816, 5),
  ]]);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].overlap, true);
  assert.equal(findings[0].page, 1);
  assert.ok(findings[0].by > 3 && findings[0].by < 6, `overlap measured as ${findings[0].by}`);
  assert.equal(findings[0].footer, "Page 1 of 3");
});

test("prose that reads like a page number does not become the footer", () => {
  // "continued on page 2 of 3" in a terms block matches the same pattern the
  // chrome does. Taking the first match made that line the footer and the real
  // footer a body line below it, which reports an overlap in a document that
  // has none.
  const findings = findFooterOverlaps([[
    line("Delivery continued on page 2 of 3 of the annex", 400),
    line("Terms and conditions apply", 500),
    line("Page 2 of 3", 816, 5),
  ]]);
  assert.deepEqual(findings, [], `reported: ${JSON.stringify(findings)}`);
});

test("a comfortable gap is not reported at all", () => {
  const findings = findFooterOverlaps([[
    line("Line item 29", 700),
    line("Page 2 of 3", 816, 5),
  ]]);
  assert.deepEqual(findings, []);
});

test("clearing the footer by a hair is a note, not a defect", () => {
  // Nothing is wrong yet; nothing is holding it off either.
  const findings = findFooterOverlaps([[
    line("Line item 30", 810, 4),
    line("Page 3 of 3", 816, 5),
  ]]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].overlap, false);
});

test("a page with no recognisable footer contributes nothing", () => {
  // Guessing which line was meant as chrome would invent the defect it claims
  // to find.
  assert.deepEqual(findFooterOverlaps([[line("Terms and conditions", 800)]]), []);
});

test("each page is judged on its own", () => {
  const findings = findFooterOverlaps([
    [line("clear", 700), line("Page 1 of 2", 816, 5)],
    [line("crowded", 814, 6), line("Page 2 of 2", 816, 5)],
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].page, 2);
  assert.equal(findings[0].overlap, true);
});

// --- the gate ----------------------------------------------------------------

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcdi-${label}-`));
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

function scenario({ label, flow, pageCount, data }) {
  const root = path.join(tempDir(label), "graphcompose-flow");
  const project = path.join(root, "projects", "demo");
  const revision = path.join(project, "revisions", "revision-001");
  writeJson(path.join(root, "flow.config.json"), { schemaVersion: 1 });
  writeJson(path.join(project, "template-project.json"), {
    projectName: "demo",
    docKind: "invoice",
    schemaVersion: 1,
  });
  writeJson(path.join(revision, "visual-analysis.json"), {
    schemaVersion: 1,
    page: pageCount === undefined ? {} : { pageCount },
    regions: [{ id: "body", label: "Body" }],
    ...(flow ? { flow } : {}),
  });
  if (data) writeJson(path.join(revision, "invoice-data.json"), data);
  return { root, project, revision };
}

function runCli(root) {
  const spawned = spawnSync(
    process.execPath,
    [CLI, "--project", "demo", "--revision", "revision-001", "--root", root, "--json"],
    { encoding: "utf8" },
  );
  let parsed = null;
  try {
    parsed = JSON.parse(spawned.stdout);
  } catch {
    /* text or failure */
  }
  return { status: spawned.status, parsed, output: `${spawned.stdout}${spawned.stderr}` };
}

test("with no render there is nothing to check, and that is not a failure", () => {
  const s = scenario({ label: "norender", flow: { kind: "flowing" } });
  const { status, parsed } = runCli(s.root);
  assert.equal(status, 0);
  assert.equal(parsed.checked, false);
  assert.match(parsed.skipped, /no output\.pdf/);
});

test("usage errors are usage errors", () => {
  assert.equal(spawnSync(process.execPath, [CLI], { encoding: "utf8" }).status, 2);
  assert.equal(
    spawnSync(process.execPath, [CLI, "--project", "demo"], { encoding: "utf8" }).status,
    2,
  );
});

// --- the fixture the gate exists for -----------------------------------------

test("the overflow fixture is registered and asks the questions the gate asks", () => {
  // The probe renders the same table twice — once fitting, once not — and reads
  // both back. It is the fixture that proves the chrome API does what the pack
  // says, and its questions are the gate's questions.
  const registry = fs.readFileSync(
    path.join(
      repoRoot,
      "tools/diagnostics/graphcompose-2.2/src/main/java/com/demcha/graphcompose/diagnostics/Probes.java",
    ),
    "utf8",
  );
  assert.match(registry, /"page-enumeration", PageEnumerationProbe::new/);

  const probe = fs.readFileSync(
    path.join(
      repoRoot,
      "tools/diagnostics/graphcompose-2.2/src/main/java/com/demcha/graphcompose/diagnostics/PageEnumerationProbe.java",
    ),
    "utf8",
  );
  for (const property of [
    "singlePageStaysSinglePage",
    "overflowPaginates",
    "enumerationCorrect",
    "headerRepeats",
    "footerRepeats",
    "rowsSurvivePagination",
  ]) {
    assert.match(probe, new RegExp(property), `the fixture does not report ${property}`);
  }
  assert.match(probe, /repeatHeader\(\)/, "the fixture does not exercise a repeated table header");
  assert.match(probe, /Page \{page\} of \{pages\}/, "the fixture does not exercise page enumeration");
});

test("the analysis contract forces the enumeration decision for a flowing document", () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "schemas", "visual-analysis.schema.json"), "utf8"),
  );
  const flow = schema.properties.flow;
  assert.ok(flow.properties.pageEnumeration, "there is nowhere to record the decision");
  const conditional = flow.allOf?.[0];
  assert.equal(conditional?.if?.properties?.kind?.const, "flowing");
  assert.deepEqual(conditional?.then?.required, ["pageEnumeration"],
    "a flowing document can still be analysed without anyone deciding about page numbers");
  assert.match(
    flow.properties.pageEnumeration.properties.format.description,
    /\{pages\}/,
    "the format field does not say that the total is the half that matters",
  );
});
