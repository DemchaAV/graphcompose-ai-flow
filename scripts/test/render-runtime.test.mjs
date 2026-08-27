#!/usr/bin/env node
/**
 * scripts/test/render-runtime.test.mjs — the staleness check that keeps the
 * shared renderer out of every render.
 *
 * The jar lives in the INSTALL, not in the project. Rebuilding it on every
 * render made it shared mutable state between anything else using the harness
 * at the same time — a second template session, or the test suite — and the
 * failure is not a missing file. Maven replaces the jar atomically, but a JVM
 * loads classes lazily, so swapping it under a live process kills the handle
 * it has not finished reading from:
 *
 *     NoClassDefFoundError: org/apache/pdfbox/.../SetTextHorizontalScaling
 *       at PDFRenderer.createPageDrawer(PDFRenderer.java:528)
 *
 * What is asserted here is the decision, not the build: given a jar and its
 * sources, does the check say rebuild, and does it say why.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { jarIsStale } from "../lib/render-runtime.mjs";

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcrt-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

/** A jar and a source tree, with the jar built `ageMs` AFTER the sources. */
function scenario(label, ageMs = 10_000) {
  const dir = tempDir(label);
  const src = path.join(dir, "src", "main", "java");
  fs.mkdirSync(src, { recursive: true });
  const source = path.join(src, "Renderer.java");
  const pom = path.join(dir, "pom.xml");
  const jar = path.join(dir, "target.jar");
  fs.writeFileSync(source, "class Renderer {}", "utf8");
  fs.writeFileSync(pom, "<project/>", "utf8");
  fs.writeFileSync(jar, "jar", "utf8");

  const base = Date.now();
  fs.utimesSync(source, new Date(base), new Date(base));
  fs.utimesSync(pom, new Date(base), new Date(base));
  fs.utimesSync(jar, new Date(base + ageMs), new Date(base + ageMs));
  return { dir, source, pom, jar, inputs: [path.join(dir, "src"), pom], base };
}

test("a jar newer than its sources is not rebuilt", () => {
  const s = scenario("current");
  assert.equal(jarIsStale(s.jar, s.inputs), null);
});

test("a missing jar is stale, and says so rather than throwing", () => {
  const s = scenario("nojar");
  fs.rmSync(s.jar);
  assert.equal(jarIsStale(s.jar, s.inputs), "no jar yet");
});

test("a touched source makes the jar stale, and the reason names the file", () => {
  // The reason is carried on purpose: "rebuild" with no cause is a line a
  // reader stops seeing, and a rebuild should now be an event, not the norm.
  const s = scenario("touched");
  const later = new Date(s.base + 60_000);
  fs.utimesSync(s.source, later, later);

  const reason = jarIsStale(s.jar, s.inputs);
  assert.ok(reason, "a newer source did not mark the jar stale");
  assert.match(reason, /Renderer\.java/);
});

test("the pom counts as a source, not just the java tree", () => {
  // A dependency bump changes what the jar contains without touching a .java.
  const s = scenario("pom");
  const later = new Date(s.base + 60_000);
  fs.utimesSync(s.pom, later, later);

  assert.match(jarIsStale(s.jar, s.inputs) ?? "", /pom\.xml/);
});

test("a source nested deep in the tree still counts", () => {
  const s = scenario("nested");
  const deep = path.join(s.dir, "src", "main", "java", "com", "demcha", "Deep.java");
  fs.mkdirSync(path.dirname(deep), { recursive: true });
  fs.writeFileSync(deep, "class Deep {}", "utf8");
  const later = new Date(s.base + 60_000);
  fs.utimesSync(deep, later, later);

  assert.match(jarIsStale(s.jar, s.inputs) ?? "", /Deep\.java/);
});

test("an input that does not exist is skipped rather than fatal", () => {
  // Inputs are resolved from config and a checkout may legitimately lack one.
  // Throwing here would fail a render over a question about a build.
  const s = scenario("missing");
  const reason = jarIsStale(s.jar, [...s.inputs, path.join(s.dir, "not-here")]);
  assert.equal(reason, null);
});
