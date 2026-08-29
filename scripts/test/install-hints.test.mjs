#!/usr/bin/env node
/**
 * scripts/test/install-hints.test.mjs — the command `setup` prints for a tool
 * this machine does not have.
 *
 * Worth testing rather than eyeballing because the failure is silent: a wrong
 * platform key falls back rather than throwing, so a Windows user would be told
 * to run `apt-get` and nobody would hear about it.
 *
 *   node --test "scripts/test/**\/*.test.mjs"
 */

import assert from "node:assert/strict";
import test from "node:test";

import { installHint, knownTools } from "../lib/install-hints.mjs";

test("each platform gets its own package manager", () => {
  assert.equal(installHint("imagemagick", "win32"), "winget install ImageMagick.ImageMagick");
  assert.equal(installHint("imagemagick", "darwin"), "brew install imagemagick");
  assert.equal(installHint("imagemagick", "linux"), "sudo apt-get install -y imagemagick");
});

test("the tools setup checks all have a command", () => {
  // The four `setup` names in its own report. A tool it can report as missing
  // and say nothing about is the gap this module exists to close.
  for (const tool of ["java", "maven", "imagemagick", "node"]) {
    assert.ok(knownTools().includes(tool), `${tool} has no install command`);
    assert.ok(installHint(tool, "win32"), `${tool} has no Windows command`);
  }
});

test("the name is taken as it is printed, not as it is keyed", () => {
  // `setup` prints "ImageMagick" and "Java"; asking the caller to lowercase
  // them is a rule someone forgets exactly once.
  assert.equal(installHint("ImageMagick", "darwin"), "brew install imagemagick");
  assert.equal(installHint("Java", "darwin"), "brew install openjdk@21");
});

test("an unfamiliar platform is treated as Debian, not left silent", () => {
  // freebsd, aix, android: apt is wrong there, and wrong-but-translatable beats
  // a missing line that sends the reader back to a documentation page.
  assert.equal(installHint("maven", "freebsd"), "sudo apt-get install -y maven");
});

test("a tool with nothing sensible to say returns null", () => {
  assert.equal(installHint("git"), null);
  assert.equal(installHint(""), null);
  assert.equal(installHint(undefined), null);
});
