#!/usr/bin/env node
/**
 * scripts/test/phases.test.mjs — which part of the run was expensive.
 *
 * The three-clock report prices a run and cannot say what inside it cost the
 * money. Splitting the same transcript by phase is what turned "129M cache-read
 * tokens" into "84% of it was the loop and 3% was the fan-out" — the difference
 * between having a number and being able to act on one.
 *
 * Two properties are load-bearing here, and both are about honesty rather than
 * arithmetic:
 *
 *   A phase table is omitted when the host reports no usage, never zeroed. A
 *   run that looks free invites exactly the wrong conclusion.
 *
 *   Segmentation says how it was derived. A number whose derivation is not
 *   stated gets quoted as if it were exact.
 *
 *   node --test scripts/test/
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { artifactSizes, foldByPhase, phaseMarkers, renderTiming, resolveMarks, workerNameOf } from "../telemetry/phases.mjs";

const temps = [];
process.on("exit", () => {
  for (const dir of temps) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
});
function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcphases-${label}-`));
  temps.push(dir);
  return dir;
}

const T0 = Date.parse("2026-09-02T08:00:00.000Z");
const at = (minutes) => T0 + minutes * 60_000;

/** One request: `context` is how big the conversation was when it was sent. */
const req = (minutes, { out = 100, cacheRead = 50_000, context = 60_000, tools = [] } = {}) => ({
  at: new Date(at(minutes)).toISOString(),
  atMs: at(minutes),
  isSidechain: false,
  usage: { inputTokens: 10, outputTokens: out, cacheReadTokens: cacheRead, cacheWriteTokens: 1_000, requests: 1 },
  context,
  tools,
});

// --------------------------------------------------------------- segmentation ---

test("phases are attributed by the tool that opened them", () => {
  const events = [
    req(0, { tools: ["Bash: node scripts/preflight.mjs --project-dir ."] }),
    req(1),
    req(2, { tools: ["Bash: node scripts/reference.mjs analyze --project demo"] }),
    req(3),
    req(4, { tools: ["Write: /w/projects/demo/revisions/revision-001/generated-template.java"] }),
    req(5, { tools: ["Bash: node scripts/pass.mjs --project demo"] }),
    req(6),
  ];
  const { marks } = resolveMarks(events, phaseMarkers(null));
  const rows = foldByPhase(events, marks);

  assert.deepEqual(rows.map((r) => r.phase), ["setup", "discovery", "authoring", "loop"]);
  assert.deepEqual(rows.map((r) => r.requests), [2, 2, 1, 2]);
});

test("a marker seen before its phase can begin does not re-order the run", () => {
  // A real run read another project's generated-template.java while planning,
  // 90 requests before it authored anything. Taking the first hit anywhere put
  // authoring before discovery and reported discovery as never having happened.
  const events = [
    req(0, { tools: ["Bash: cat /w/projects/other/revisions/revision-002/generated-template.java"] }),
    req(1, { tools: ["Bash: node scripts/preflight.mjs"] }),
    req(2, { tools: ["Bash: node scripts/reference.mjs bands --project demo"] }),
    req(3, { tools: ["Write: /w/projects/demo/revisions/revision-001/generated-template.java"] }),
  ];
  const { marks } = resolveMarks(events, phaseMarkers(null));

  assert.deepEqual(marks.map((m) => m.phase), ["setup", "discovery", "authoring"]);
  for (let i = 1; i < marks.length; i += 1) {
    assert.ok(marks[i].atMs >= marks[i - 1].atMs, "phase openings went backwards");
  }
});

test("discovery opens on any reference.mjs subcommand, not only analyze", () => {
  // One recorded run opened discovery with `reference.mjs bands`. A marker that
  // names one of a tool's subcommands reports the phase as never happening.
  const events = [req(0, { tools: ["Bash: node scripts/reference.mjs bands --project demo"] })];
  const { marks } = resolveMarks(events, phaseMarkers(null));
  assert.deepEqual(marks.map((m) => m.phase), ["discovery"]);
});

test("a recorded handoff timestamp beats the inferred boundary", () => {
  const events = [
    req(0, { tools: ["Bash: node scripts/reference.mjs analyze"] }),
    req(5),
    req(9, { tools: ["Write: /w/projects/demo/revisions/revision-001/generated-template.java"] }),
  ];
  const { marks, source } = resolveMarks(events, phaseMarkers(null), [{ phase: "authoring", atMs: at(4) }]);

  assert.match(source, /handoff\.json \(recorded\)/);
  assert.equal(marks.find((m) => m.phase === "authoring").atMs, at(4));
});

test("marker tools are named as the derivation when nothing was recorded", () => {
  const { source } = resolveMarks([req(0, { tools: ["Bash: node scripts/preflight.mjs"] })], phaseMarkers(null));
  assert.match(source, /marker tools/);
});

test("markers follow the tool a stage declares", () => {
  // So a stage that changes its tool does not leave the segmentation reading
  // the old name.
  const markers = phaseMarkers({ stages: { testRender: { tool: "scripts/other-render.mjs" } } });
  const loop = markers.find((m) => m.phase === "loop");
  assert.ok(loop.match.test("Bash: node scripts/other-render.mjs --project demo"));
});

// ------------------------------------------------------------------ the fold ---

test("each phase reports its share and what it grew the context by", () => {
  const events = [
    req(0, { cacheRead: 10_000, context: 60_000, tools: ["Bash: node scripts/preflight.mjs"] }),
    req(1, { cacheRead: 10_000, context: 80_000 }),
    req(2, { cacheRead: 30_000, context: 100_000, tools: ["Bash: node scripts/pass.mjs"] }),
    req(3, { cacheRead: 50_000, context: 300_000 }),
  ];
  const { marks } = resolveMarks(events, phaseMarkers(null));
  const rows = foldByPhase(events, marks);

  const setup = rows.find((r) => r.phase === "setup");
  const loop = rows.find((r) => r.phase === "loop");
  assert.equal(setup.usage.cacheReadTokens, 20_000);
  assert.equal(loop.usage.cacheReadTokens, 80_000);
  assert.equal(Math.round(loop.shareOfCacheRead * 100), 80);
  assert.equal(setup.contextGrowth, 20_000, "setup grew the conversation by 20k");
  assert.equal(loop.contextGrowth, 200_000, "the loop's own growth is what a boundary would move");
  assert.equal(loop.durationMs, 60_000);
});

test("tool calls are counted per phase", () => {
  const events = [
    req(0, { tools: ["Bash: node scripts/preflight.mjs", "Read"] }),
    req(1, { tools: ["Bash: node scripts/pass.mjs"] }),
    req(2, { tools: ["Edit", "Edit", "Read"] }),
  ];
  const { marks } = resolveMarks(events, phaseMarkers(null));
  const rows = foldByPhase(events, marks);
  assert.equal(rows.find((r) => r.phase === "setup").toolCalls, 2);
  assert.equal(rows.find((r) => r.phase === "loop").toolCalls, 4);
});

test("a request that returned no usage is not a context measurement", () => {
  // From a real run that hit an account usage limit: the last two requests came
  // back with no usage at all, their context read as 0, and the phase's growth
  // collapsed from +125.5k to +0. A cut-short run must not report like a
  // complete one, so those requests are counted and excluded from the figures.
  const events = [
    req(0, { context: 60_000, tools: ["Bash: node scripts/reference.mjs analyze"] }),
    req(1, { context: 120_000 }),
    req(2, { context: 185_000 }),
    { at: null, atMs: at(3), isSidechain: false, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 1 }, context: 0, tools: [] },
    { at: null, atMs: at(4), isSidechain: false, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, requests: 1 }, context: 0, tools: [] },
  ];
  const { marks } = resolveMarks(events, phaseMarkers(null));
  const row = foldByPhase(events, marks).find((r) => r.phase === "discovery");

  assert.equal(row.requests, 5, "the refused requests are still requests");
  assert.equal(row.unmeasured, 2, "the refused requests are not reported as measurements");
  assert.equal(row.contextGrowth, 125_000, "a zero-usage request was taken as a context reading");
  assert.equal(row.contextEnd, 185_000);
});

test("requests before any marker belong to setup rather than to nothing", () => {
  const rows = foldByPhase([req(0), req(1)], []);
  assert.deepEqual(rows.map((r) => r.phase), ["setup"]);
  assert.equal(rows[0].requests, 2);
});

test("a run with no events yields no rows, not a table of zeros", () => {
  assert.deepEqual(foldByPhase([], []), []);
});

// ----------------------------------------------------------- worker attribution ---

test("a worker is named from the filename, where the host puts it there", () => {
  assert.equal(workerNameOf("/s/subagents/agent-ageometry-9403c4e35bcb0e31.jsonl"), "geometry");
  assert.equal(workerNameOf("/s/subagents/agent-acontent-bd4f011afe2e1e0e.jsonl"), "content");
  assert.equal(workerNameOf("/s/subagents/agent-aassets-f843b692c6411b7e.jsonl"), "assets");
});

test("a worker is named from the sidecar, where the host puts it there instead", () => {
  // Both conventions were seen on real runs of the same host. Reading only the
  // filename reported three named discovery workers as "(unnamed)" and made the
  // worker share unreportable — which is the one figure that settles whether
  // the fan-out is expensive.
  const dir = tempDir("meta");
  const transcript = path.join(dir, "agent-a0c2b9e52ddb842e5.jsonl");
  fs.writeFileSync(transcript, "");
  fs.writeFileSync(
    path.join(dir, "agent-a0c2b9e52ddb842e5.meta.json"),
    JSON.stringify({ agentType: "general-purpose", description: "Asset request", name: "assets", spawnDepth: 1 }),
  );
  assert.equal(workerNameOf(transcript), "assets");
});

test("the sidecar wins over the filename when both name a worker", () => {
  const dir = tempDir("meta-wins");
  const transcript = path.join(dir, "agent-ageometry-9403c4e35bcb0e31.jsonl");
  fs.writeFileSync(transcript, "");
  fs.writeFileSync(path.join(dir, "agent-ageometry-9403c4e35bcb0e31.meta.json"), JSON.stringify({ name: "content" }));
  assert.equal(workerNameOf(transcript), "content", "the authoritative record lost to the filename");
});

test("an unnamed subagent is not silently folded into the coordinator", () => {
  // Where it would look like main-thread cost, which is the one thing this
  // breakdown exists to tell apart.
  assert.equal(workerNameOf("/s/subagents/agent-add7c6f015111d4b5.jsonl"), null);
  assert.equal(workerNameOf("not-a-transcript"), null);
  assert.equal(workerNameOf(null), null);

  // A sidecar that exists but names nothing is the same as no sidecar.
  const dir = tempDir("meta-empty");
  const transcript = path.join(dir, "agent-add7c6f015111d4b5.jsonl");
  fs.writeFileSync(transcript, "");
  fs.writeFileSync(path.join(dir, "agent-add7c6f015111d4b5.meta.json"), JSON.stringify({ agentType: "general-purpose" }));
  assert.equal(workerNameOf(transcript), null);
});

// -------------------------------------------------------------- from the disk ---

test("artifact sizes come from the revision, so a run with no telemetry still answers", () => {
  const dir = tempDir("artifacts");
  fs.writeFileSync(path.join(dir, "visual-analysis.json"), "x".repeat(2048));
  fs.writeFileSync(path.join(dir, "cv-data.json"), "y".repeat(512));

  const sizes = artifactSizes(dir);
  assert.equal(sizes["visual-analysis.json"], 2048);
  assert.equal(sizes["<doc-kind>-data.json"], 512);
  assert.equal(sizes["architecture-plan.json"], null, "an artifact that is not there is null, not zero");
});

test("time to first render is measured, or reported as not recorded", () => {
  const project = tempDir("render");
  const revisions = path.join(project, "revisions");
  const first = path.join(revisions, "revision-001");
  fs.mkdirSync(first, { recursive: true });
  fs.writeFileSync(
    path.join(first, "revision.json"),
    JSON.stringify({ id: "revision-001", openedAt: new Date(at(0)).toISOString() }),
  );

  const before = renderTiming(project);
  assert.equal(before.renders, 0);
  assert.equal(before.timeToFirstRenderMs, null, "no render yet is null, not zero");

  fs.writeFileSync(path.join(first, "output.pdf"), "%PDF-");
  fs.utimesSync(path.join(first, "output.pdf"), new Date(at(30)), new Date(at(30)));

  const after = renderTiming(project);
  assert.equal(after.renders, 1);
  assert.equal(after.timeToFirstRenderMs, 30 * 60_000);
});

test("a project with no revisions reports zero renders and no timing", () => {
  const timing = renderTiming(tempDir("empty"));
  assert.equal(timing.renders, 0);
  assert.equal(timing.timeToFirstRenderMs, null);
  assert.equal(timing.firstRenderAt, null);
});
