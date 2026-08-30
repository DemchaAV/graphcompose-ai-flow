#!/usr/bin/env node
/**
 * scripts/test/guard-bash.test.mjs — the four shortcuts the hook refuses, and
 * everything it must leave alone.
 */

import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { judgeCommand, main } from "../hooks/guard-bash.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const HOOK = path.join(repoRoot, "scripts", "hooks", "guard-bash.mjs");

const blocked = (command, rule) => {
  const verdict = judgeCommand(command);
  assert.equal(verdict.block, true, `expected "${command}" to be blocked`);
  assert.equal(verdict.rule, rule, `"${command}" blocked under ${verdict.rule}, expected ${rule}`);
  assert.match(verdict.message, /node scripts\//, "a refusal names the command to run instead");
};
const allowed = (command) => {
  const verdict = judgeCommand(command);
  assert.equal(verdict.block, false, `expected "${command}" to pass, blocked as ${verdict.rule}`);
};

test("reading a template through the shell is refused, with source.mjs named", () => {
  blocked("cat revisions/revision-003/GeneratedCvTemplate.java", "template-read");
  blocked("sed -n 400,520p graphcompose-flow/projects/x/revisions/revision-001/generated-template.java", "template-read");
  blocked("head -100 StripeInvoiceTemplate.java", "template-read");
  blocked('Get-Content "D:\\ws\\revisions\\revision-002\\GeneratedProposalTemplate.java"', "template-read");
  // Searching is not dumping: one line back, for a question source.mjs does not answer.
  allowed("grep -n renderHeader GeneratedCvTemplate.java");
  allowed("rg ITEM_CELL_INSET revisions/revision-002/GeneratedInvoiceTemplate.java");
});

test("template sources may still be built, listed, hashed and edited through the harness", () => {
  allowed("node scripts/source.mjs symbol renderHeader --project x --revision revision-001");
  allowed("ls revisions/revision-001/");
  allowed("mvn -q -f render-runner/pom.xml package");
  allowed("git diff -- revisions/revision-002/GeneratedCvTemplate.java");
  allowed("sha1sum GeneratedCvTemplate.java");
  allowed("cat cv-data.json");
  allowed("cat InvoiceSpecProvider.java");
});

test("reading the layout snapshot is refused, with layout.mjs named", () => {
  blocked("cat revisions/revision-001/layout-snapshot.json", "snapshot-read");
  blocked("jq '.nodes[] | select(.name==\"Sidebar\")' layout-snapshot.json", "snapshot-read");
  blocked("node -e \"const s=require('./layout-snapshot.json'); console.log(s.nodes.length)\"", "snapshot-read");
  blocked("python - <<PY\nimport json; d=json.load(open('layout-snapshot.json'))\nPY", "snapshot-read");
  allowed("node scripts/layout.mjs inspect Sidebar --project x --revision revision-001");
  allowed("ls -la revisions/revision-001/layout-snapshot.json");
});

test("a raw magick compare is refused, with render-and-diff named", () => {
  blocked("magick compare -metric AE reference.png output.png diff.png", "raw-compare");
  blocked("compare -metric RMSE a.png b.png null:", "raw-compare");
  blocked("magick a.png b.png -metric AE -compare -format %[distortion] info:", "raw-compare");
  allowed("magick identify -format %wx%h reference.png");
  allowed("magick reference.png -crop 100x100+0+0 +repage crop.png");
  allowed("node scripts/render-and-diff.mjs --project x --revision revision-001 --skip-render");
});

test("patching Java with an inline Python script is refused, with the editor named", () => {
  blocked(
    "python - <<'PY'\nimport re,io\np='revisions/revision-002/GeneratedCvTemplate.java'\ns=open(p).read()\ns=re.sub(r'padding\\(0, 0, 0, 18\\)','padding(0, 0, 0, 12)',s)\nopen(p,'w').write(s)\nPY",
    "script-patch",
  );
  blocked("python -c \"p='X.java'; s=open(p).read().replace('a','b'); open(p,'w').write(s)\"", "script-patch");
  allowed("python - <<PY\nprint(1240/595)\nPY");
  allowed("python scripts/measure.py output.png");
  allowed("python -c \"import json; print(json.load(open('cv-data.json'))['name'])\"");
});

test("empty and unrelated commands pass", () => {
  allowed("");
  allowed("node scripts/preflight.mjs --project-dir .");
  allowed("git status");
  allowed("npm test");
});

test("the hook protocol: Bash only, exit 2 with the reason on stderr, off switch honoured", () => {
  const bash = JSON.stringify({ tool_name: "Bash", tool_input: { command: "cat GeneratedCvTemplate.java" } });
  assert.equal(main(bash).exit, 2);
  assert.match(main(bash).message, /source\.mjs/);
  assert.equal(main(bash, { GRAPHCOMPOSE_GUARD: "off" }).exit, 0);

  const read = JSON.stringify({ tool_name: "Read", tool_input: { file_path: "GeneratedCvTemplate.java" } });
  assert.equal(main(read).exit, 0);
  assert.equal(main("not json").exit, 0);
  assert.equal(main("").exit, 0);

  // As a process, the way the host runs it.
  const spawned = spawnSync(process.execPath, [HOOK], { input: bash, encoding: "utf8" });
  assert.equal(spawned.status, 2);
  assert.match(spawned.stderr, /graphcompose-flow guard: template-read/);
  const fine = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "git status" } }),
    encoding: "utf8",
  });
  assert.equal(fine.status, 0);
  assert.equal(fine.stderr, "");
});
