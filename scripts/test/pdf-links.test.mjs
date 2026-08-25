#!/usr/bin/env node
/**
 * scripts/test/pdf-links.test.mjs — reading link targets back out of a PDF.
 *
 * The reader is a byte scanner, not a PDF parser, so these fixtures are built
 * from the byte patterns rather than by a writer. That is not a shortcut: the
 * patterns are the ones measured in the acceptance runs' real renders, in
 * particular the action dictionary GraphCompose emits, which spells /URI twice —
 *
 *   <</Type /Action /S /URI /URI (tel:+15551234567) >>
 *
 * — once as the action's subtype name and once as the target. Counting the
 * first as a target is the mistake this file exists to keep fixed.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import zlib from "node:zlib";

import { readPdfLinks, containsTarget } from "../lib/pdf-links.mjs";

function tempFile(name, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gcpdf-"));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  const file = path.join(dir, name);
  fs.writeFileSync(file, contents);
  return file;
}

/** One link annotation, exactly as observed in a GraphCompose render. */
const annot = (target) =>
  `<</Type /Annot /Subtype /Link /Rect [10 20 30 40] ` +
  `/A <</Type /Action /S /URI /URI (${target}) >> /Border [0 0 0] >>`;

/** A PDF whose annotations sit in the plain file body. */
function uncompressed(...targets) {
  return Buffer.from(`%PDF-1.7\n${targets.map(annot).join("\n")}\n%%EOF\n`, "latin1");
}

/** A PDF whose annotations sit inside a Flate object stream, as ours do. */
function compressed(...targets) {
  const body = zlib.deflateSync(Buffer.from(targets.map(annot).join("\n"), "latin1"));
  return Buffer.concat([
    Buffer.from("%PDF-1.7\n7 0 obj\n<</Type /ObjStm /Filter /FlateDecode>>\nstream\n", "latin1"),
    body,
    Buffer.from("\nendstream\nendobj\n%%EOF\n", "latin1"),
  ]);
}

test("reads targets out of a plain file body", () => {
  const file = tempFile("plain.pdf", uncompressed("https://example.com/a", "mailto:x@example.com"));
  const links = readPdfLinks(file);
  assert.deepEqual(links.uris.sort(), ["https://example.com/a", "mailto:x@example.com"]);
  assert.equal(links.linkAnnotations, 2);
});

test("reads targets out of a Flate object stream", () => {
  // Where GraphCompose actually puts them: nothing is findable in the raw bytes.
  const file = tempFile("compressed.pdf", compressed("https://example.com/b"));
  assert.ok(!fs.readFileSync(file).includes("example.com"), "fixture is not actually compressed");
  const links = readPdfLinks(file);
  assert.deepEqual(links.uris, ["https://example.com/b"]);
  assert.equal(links.linkAnnotations, 1);
});

test("the action's /S /URI subtype name is not a target", () => {
  // Two /URI keys per annotation; only the second names a target. Counting the
  // first left every clean render reporting phantom unreadable targets.
  const file = tempFile("action.pdf", compressed("tel:+15551234567"));
  const links = readPdfLinks(file);
  assert.deepEqual(links.uris, ["tel:+15551234567"]);
  assert.equal(links.unreadableTargets, 0, "the subtype name was counted as an unreadable target");
});

test("one target linked from several places is reported once", () => {
  const file = tempFile("dup.pdf", compressed("https://example.com/c", "https://example.com/c"));
  const links = readPdfLinks(file);
  assert.deepEqual(links.uris, ["https://example.com/c"]);
  assert.equal(links.linkAnnotations, 2, "annotations count the places, not the targets");
});

test("escaped parentheses inside a target survive", () => {
  const file = tempFile("escaped.pdf", uncompressed("https://example.com/x_\\(1\\)"));
  assert.deepEqual(readPdfLinks(file).uris, ["https://example.com/x_(1)"]);
});

test("a hex-string target is decoded", () => {
  const hex = Buffer.from("https://example.com/h", "latin1").toString("hex");
  const file = tempFile(
    "hex.pdf",
    Buffer.from(`%PDF-1.7\n<</Subtype /Link /A <</S /URI /URI <${hex}> >> >>\n%%EOF\n`, "latin1"),
  );
  assert.deepEqual(readPdfLinks(file).uris, ["https://example.com/h"]);
});

test("a document with no links reads as empty, not as an error", () => {
  const file = tempFile("none.pdf", Buffer.from("%PDF-1.7\n<</Type /Page>>\n%%EOF\n", "latin1"));
  const links = readPdfLinks(file);
  assert.deepEqual(links.uris, []);
  assert.equal(links.linkAnnotations, 0);
  assert.equal(links.unreadableTargets, 0);
});

test("a stream that is not Flate is skipped rather than thrown on", () => {
  const file = tempFile(
    "raw.pdf",
    Buffer.concat([
      Buffer.from("%PDF-1.7\n5 0 obj\nstream\n", "latin1"),
      Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]),
      Buffer.from(`\nendstream\nendobj\n${annot("https://example.com/after")}\n%%EOF\n`, "latin1"),
    ]),
  );
  // The point is that the walk continues past the unreadable stream.
  assert.deepEqual(readPdfLinks(file).uris, ["https://example.com/after"]);
});

test("containsTarget forgives a trailing slash and case, not a different path", () => {
  const uris = ["https://Example.com/in/x/"];
  assert.ok(containsTarget(uris, "https://example.com/in/x"));
  assert.ok(containsTarget(uris, "https://example.com/in/x/"));
  assert.ok(!containsTarget(uris, "https://example.com/in/y"));
});
