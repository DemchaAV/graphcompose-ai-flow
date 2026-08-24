#!/usr/bin/env node
/**
 * scripts/test/publish-template.test.mjs — a published bundle matches the
 * revision it claims to come from, and says so or fails.
 *
 * Every case here is a defect the first real acceptance run left on disk
 * (docs/private/acceptance-claude.md). The bundle it produced referenced an
 * avatar it did not ship, carried a Javadoc naming a class that no longer
 * existed, and declared two dependencies while needing three. None of it was
 * caught, because publishing copied files and nothing ever read the result.
 *
 * The static tier is asserted here. Compiling and rendering a bundle needs
 * Maven, a GraphCompose artifact and the preview renderer, so it is exercised
 * by `npm run verify`, not by this suite.
 */

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PUBLISH = path.join(repoRoot, "scripts", "publish-template.mjs");
const VERIFY = path.join(repoRoot, "scripts", "verify-published-template.mjs");

function tempDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcpub-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  return dir;
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, "utf8");
}

/**
 * A workspace holding one project whose approved revision looks like the one
 * the acceptance run produced: a template class, a spec and provider that name
 * it, an avatar beside the icons, and a runner declaring three dependencies.
 */
function workspaceWith({ status = "APPROVED", label = "ws" } = {}) {
  const host = tempDir(label);
  const root = path.join(host, "graphcompose-flow");
  const project = path.join(root, "projects", "navy-cv");
  const revision = path.join(project, "revisions", "revision-008");

  write(path.join(root, "flow.config.json"), JSON.stringify({ schemaVersion: 1 }));
  write(
    path.join(project, "template-project.json"),
    JSON.stringify({
      projectName: "navy-cv",
      displayName: "Navy Sidebar CV",
      targetGraphComposeVersion: "2.2.0",
      skillPack: "skills/versions/graphcompose-2.2",
      currentApprovedRevisionId: status === "APPROVED" ? "revision-008" : null,
      currentDraftRevisionId: status === "APPROVED" ? null : "revision-008",
      docKind: "cv",
      specClass: "com.demchaav.cv.NavyCvSpec",
      specProviderClass: "com.demchaav.cv.NavyCvSpecProvider",
      render: { templateClass: "com.demchaav.cv.GeneratedCvTemplate" },
    }),
  );
  write(
    path.join(revision, "revision.json"),
    JSON.stringify({ id: "revision-008", parentRevisionId: null, status, userRequest: "cv" }),
  );
  write(
    path.join(revision, "generated-template.java"),
    "package com.demchaav.cv;\npublic final class GeneratedCvTemplate {}\n",
  );
  write(path.join(revision, "cv-data.json"), JSON.stringify({ avatarImage: "assets/avatar.png" }));

  // An asset that is neither an icon nor a font — the case the publisher used
  // to drop while the data file went on naming it.
  write(path.join(revision, "assets", "avatar.png"), "PNG");
  write(path.join(revision, "assets", "icons", "email.png"), "PNG");

  const runner = path.join(project, "render-runner");
  write(
    path.join(runner, "src", "main", "java", "com", "demchaav", "cv", "NavyCvSpec.java"),
    "package com.demchaav.cv;\n/** Rendered by {@code GeneratedCvTemplate}. */\npublic record NavyCvSpec() {}\n",
  );
  write(
    path.join(runner, "src", "main", "java", "com", "demchaav", "cv", "NavyCvSpecProvider.java"),
    "package com.demchaav.cv;\npublic final class NavyCvSpecProvider {}\n",
  );
  write(
    path.join(runner, "pom.xml"),
    [
      "<project><properties><graphcompose.version>2.2.0</graphcompose.version></properties>",
      "<dependencies>",
      "<dependency><groupId>io.github.demchaav</groupId><artifactId>graph-compose</artifactId>",
      "<version>${graphcompose.version}</version></dependency>",
      "<dependency><groupId>io.github.demchaav</groupId><artifactId>graph-compose-fonts</artifactId>",
      "<version>1.1.0</version></dependency>",
      "</dependencies></project>",
    ].join("\n"),
  );

  return { root, project, revision };
}

/** Both streams, because the approval warning goes to stderr. */
function publish(root, extra = []) {
  const run = spawnSync(
    process.execPath,
    [PUBLISH, "--project", "navy-cv", "--root", root, ...extra],
    { encoding: "utf8" },
  );
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  if (run.status !== 0) {
    const error = new Error(`publish exited ${run.status}\n${output}`);
    error.status = run.status;
    error.output = output;
    throw error;
  }
  return output;
}

function failing(run) {
  try {
    run();
    assert.fail("expected a non-zero exit");
  } catch (err) {
    if (err instanceof assert.AssertionError) throw err;
    // execFileSync puts an array on `.output`; only our own publish() helper
    // sets a string there. Concatenating the streams covers both.
    return {
      status: err.status,
      output: typeof err.output === "string"
        ? err.output
        : `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

const bundleOf = (root) => path.join(root, "templates", "navy-sidebar-cv");

test("a DRAFT revision is refused, not published with a warning", () => {
  const { root } = workspaceWith({ status: "DRAFT", label: "draft" });
  const { output } = failing(() => publish(root, ["--revision", "revision-008"]));

  assert.match(output, /is DRAFT, not APPROVED/);
  assert.ok(!fs.existsSync(bundleOf(root)), "a bundle was written for a DRAFT revision");
});

test("--allow-unapproved publishes a DRAFT, and says the bundle is not approved", () => {
  const { root } = workspaceWith({ status: "DRAFT", label: "allow" });
  const output = publish(root, ["--revision", "revision-008", "--allow-unapproved"]);

  assert.match(output, /WARN: publishing DRAFT/);
  assert.ok(fs.existsSync(path.join(bundleOf(root), "template.json")));
});

test("every asset in the revision reaches the bundle, not just icons", () => {
  const { root } = workspaceWith({ label: "assets" });
  publish(root);

  // The acceptance run's bundle named assets/avatar.png in its example data
  // and did not contain it; nothing failed until someone tried to use it.
  assert.ok(fs.existsSync(path.join(bundleOf(root), "assets", "avatar.png")), "avatar.png was dropped");
  assert.ok(fs.existsSync(path.join(bundleOf(root), "assets", "icons", "email.png")), "icons were dropped");
});

test("the published class is rewritten from the revision on every publish", () => {
  const { root, revision } = workspaceWith({ label: "determinism" });
  publish(root);

  const published = path.join(bundleOf(root), "src", "NavySidebarCvTemplate.java");
  fs.writeFileSync(published, "// hand-edited, and stale\n", "utf8");

  write(
    path.join(revision, "generated-template.java"),
    "package com.demchaav.cv;\npublic final class GeneratedCvTemplate { /* v2 */ }\n",
  );
  const output = publish(root);

  const contents = fs.readFileSync(published, "utf8");
  assert.match(contents, /v2/, "the bundle kept a stale class instead of the approved revision's");
  assert.ok(!contents.includes("hand-edited"), "a hand edit survived a publish");
  assert.match(output, /UPDATED/, "the change was applied without being reported");
});

test("the spec and provider are renamed too, so no source names the revision-local class", () => {
  const { root } = workspaceWith({ label: "rename" });
  publish(root);

  const spec = fs.readFileSync(path.join(bundleOf(root), "src", "NavyCvSpec.java"), "utf8");
  assert.ok(!spec.includes("GeneratedCvTemplate"), "the spec still names the revision-local class");
  assert.match(spec, /NavySidebarCvTemplate/);
});

test("dependencies come from the runner, so the manifest cannot know less than the build", () => {
  const { root } = workspaceWith({ label: "deps" });
  publish(root);

  const manifest = JSON.parse(fs.readFileSync(path.join(bundleOf(root), "template.json"), "utf8"));
  // graph-compose-fonts was the case in the acceptance run: the README knew
  // about it, the manifest did not, and a build file generated from the
  // manifest would not have compiled.
  assert.equal(manifest.dependencies["io.github.demchaav:graph-compose"], "2.2.0");
  assert.equal(manifest.dependencies["io.github.demchaav:graph-compose-fonts"], "1.1.0");
});

test("an absolute path in a published source fails the publish", () => {
  const { root, revision } = workspaceWith({ label: "abspath" });
  write(
    path.join(revision, "generated-template.java"),
    'package com.demchaav.cv;\npublic final class GeneratedCvTemplate {\n  String p = "C:\\\\Dev\\\\projects\\\\x.png";\n}\n',
  );

  const { output } = failing(() => publish(root));
  assert.match(output, /absolute path/);
});

test("verify reports a bundle that does not contain what its data references", () => {
  const { root } = workspaceWith({ label: "verify" });
  publish(root);
  write(path.join(bundleOf(root), "README.md"), "# Navy Sidebar CV\n");
  fs.rmSync(path.join(bundleOf(root), "assets", "avatar.png"));

  const { status, output } = failing(() =>
    execFileSync(process.execPath, [VERIFY, "--template-id", "navy-sidebar-cv", "--root", root], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );

  assert.equal(status, 1);
  assert.match(output, /references "assets\/avatar\.png", which the bundle does not contain/);
});

test("verify passes on a complete bundle and reports what it checked", () => {
  const { root } = workspaceWith({ label: "verifyok" });
  publish(root);
  write(path.join(bundleOf(root), "README.md"), "# Navy Sidebar CV\n");

  const parsed = JSON.parse(
    execFileSync(
      process.execPath,
      [VERIFY, "--template-id", "navy-sidebar-cv", "--root", root, "--json"],
      { encoding: "utf8" },
    ),
  );

  assert.equal(parsed.verified, true);
  assert.ok(parsed.checks.some((c) => c.includes("assets/avatar.png")), "the asset check did not run");
  assert.deepEqual(parsed.problems, []);
});

test("verify refuses a missing bundle rather than reporting it as clean", () => {
  const { root } = workspaceWith({ label: "missing" });
  const { status, output } = failing(() =>
    execFileSync(process.execPath, [VERIFY, "--template-id", "nope", "--root", root], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }),
  );
  assert.equal(status, 1);
  assert.match(output, /no bundle at/);
});
