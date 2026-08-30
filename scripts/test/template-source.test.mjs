#!/usr/bin/env node
/**
 * scripts/test/template-source.test.mjs — a revision holds one template.
 *
 * The two names are a fact of Java tooling, not a choice (see
 * lib/template-source.mjs). What is under test is that the precedence matches
 * the pom's, and that the copy the build ignores is reported rather than left
 * for an agent to keep editing.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  describeIgnoredCopies,
  FLOW_TEMPLATE_NAME,
  resolveTemplateSource,
} from "../lib/template-source.mjs";

const SOURCE = "public final class GeneratedInvoiceTemplate {\n  void build() {}\n}\n";

function revisionWith(files, label = "tpl") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gctpl-${label}-`));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

test("the flow's own name is the template when it is the only one", () => {
  const dir = revisionWith({ [FLOW_TEMPLATE_NAME]: SOURCE }, "flow-only");
  const resolved = resolveTemplateSource({ revisionDir: dir, canonicalName: "GeneratedInvoiceTemplate" });

  assert.equal(resolved.name, FLOW_TEMPLATE_NAME);
  assert.deepEqual(resolved.ignored, []);
  assert.equal(describeIgnoredCopies(resolved), null);
});

test("the canonical name wins when both exist, matching the pom's condition", () => {
  const dir = revisionWith(
    { "GeneratedInvoiceTemplate.java": SOURCE, [FLOW_TEMPLATE_NAME]: SOURCE },
    "both",
  );
  const resolved = resolveTemplateSource({ revisionDir: dir, canonicalName: "GeneratedInvoiceTemplate" });

  assert.equal(resolved.name, "GeneratedInvoiceTemplate.java");
  assert.deepEqual(resolved.ignored.map((c) => c.name), [FLOW_TEMPLATE_NAME]);
  assert.equal(resolved.divergent, false);
  assert.match(describeIgnoredCopies(resolved), /never reads|not\s+compiled/);
});

test("an ignored copy that has drifted is reported as a second truth, not a duplicate", () => {
  const dir = revisionWith(
    { "GeneratedInvoiceTemplate.java": SOURCE, [FLOW_TEMPLATE_NAME]: SOURCE.replace("build", "compose") },
    "drift",
  );
  const resolved = resolveTemplateSource({ revisionDir: dir, canonicalName: "GeneratedInvoiceTemplate" });

  assert.equal(resolved.divergent, true);
  assert.match(describeIgnoredCopies(resolved), /DIFFERS/);
});

test("line endings alone are not drift", () => {
  const dir = revisionWith(
    { "GeneratedInvoiceTemplate.java": SOURCE, [FLOW_TEMPLATE_NAME]: SOURCE.replace(/\n/g, "\r\n") },
    "crlf",
  );
  const resolved = resolveTemplateSource({ revisionDir: dir, canonicalName: "GeneratedInvoiceTemplate" });

  assert.equal(resolved.divergent, false, "CRLF vs LF was read as a fork");
});

test("a fully-qualified declaration resolves to its simple name", () => {
  const dir = revisionWith({ "GeneratedInvoiceTemplate.java": SOURCE }, "fqcn");
  const resolved = resolveTemplateSource({
    revisionDir: dir,
    canonicalName: "com.example.invoice.GeneratedInvoiceTemplate",
  });

  assert.equal(resolved.name, "GeneratedInvoiceTemplate.java");
});

test("a revision with no template yet is not a fault", () => {
  const dir = revisionWith({}, "empty");
  const resolved = resolveTemplateSource({ revisionDir: dir, canonicalName: "GeneratedInvoiceTemplate" });

  assert.equal(resolved.file, null);
  assert.deepEqual(resolved.candidates, ["GeneratedInvoiceTemplate.java", FLOW_TEMPLATE_NAME]);
});

test("a project that declares no class still resolves the flow's name", () => {
  const dir = revisionWith({ [FLOW_TEMPLATE_NAME]: SOURCE }, "undeclared");
  const resolved = resolveTemplateSource({ revisionDir: dir, canonicalName: null });

  assert.equal(resolved.name, FLOW_TEMPLATE_NAME);
  assert.deepEqual(resolved.candidates, [FLOW_TEMPLATE_NAME]);
});
