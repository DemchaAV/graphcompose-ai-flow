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

test("an svg icon reaches the bundle, now that icons resolve as vectors", () => {
  // Icons stopped being PNGs. A publisher that copied by extension would ship a
  // bundle whose manifest names a file it does not contain.
  const { root, revision } = workspaceWith({ label: "svgasset" });
  write(path.join(revision, "assets", "icons", "mail.svg"), '<svg viewBox="0 0 8 8"><path d="M0 0 L1 1"/></svg>');
  publish(root);

  assert.ok(
    fs.existsSync(path.join(bundleOf(root), "assets", "icons", "mail.svg")),
    "the svg icon was dropped from the bundle",
  );
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

test("the manifest carries the consumer contract, so a generator substitutes rather than infers", () => {
  const { root } = workspaceWith({ label: "contract" });
  publish(root);

  const manifest = JSON.parse(fs.readFileSync(path.join(bundleOf(root), "template.json"), "utf8"));

  assert.equal(manifest.schemaVersion, "1.2.0");
  // The published class is renamed from the revision's, and the package comes
  // from the file as copied — not from the revision, and not from a convention.
  assert.deepEqual(manifest.entrypoint, {
    templateClass: "com.demchaav.cv.NavySidebarCvTemplate",
    specClass: "com.demchaav.cv.NavyCvSpec",
    providerClass: "com.demchaav.cv.NavyCvSpecProvider",
  });
  // Both halves. The example is what the bundle ships; runtimeName is what a
  // consumer must rename it to, which is the half `dataFile` never stated.
  assert.deepEqual(manifest.data, {
    example: "data/cv-data.example.json",
    runtimeName: "cv-data.json",
  });
  assert.deepEqual(manifest.resources, { assets: "assets", manifest: null });
  assert.equal(manifest.graphComposeVersion, "2.2.0", "lifted out of dependencies for a catalog to print");
  assert.equal(manifest.version, "1.0.0");
  assert.ok(!("dataFile" in manifest), "dataFile is the deprecated half-answer; writers no longer emit it");
});

test("the bundle version is preserved across a republish, and only --version moves it", () => {
  const { root } = workspaceWith({ label: "version" });
  const read = () => JSON.parse(fs.readFileSync(path.join(bundleOf(root), "template.json"), "utf8"));

  publish(root, ["--version", "2.1.0"]);
  assert.equal(read().version, "2.1.0");

  // A republish is a new render of the same template, not a new release of it.
  // Resetting the version here would silently tell every consumer they are
  // already up to date.
  publish(root);
  assert.equal(read().version, "2.1.0");
});

test("a path into the harness that a consumer does not have fails the publish", () => {
  const { root, revision } = workspaceWith({ label: "portability" });
  write(
    path.join(revision, "generated-template.java"),
    "package com.demchaav.cv;\n" +
      "/** See examples/navy-cv/revisions/revision-008/visual-review.md. */\n" +
      "public final class GeneratedCvTemplate {}\n",
  );

  const { output } = failing(() => publish(root));
  assert.match(output, /revisions\/ directory/);
  assert.match(output, /generated-template\.java|NavySidebarCvTemplate\.java/, "the finding must name the file");
});

test("the property published providers read is reported on every publish, and stops none of them", () => {
  // Real, scheduled, and not fixable without breaking every bundle already
  // published. Silencing it would be how it gets forgotten; failing over it
  // would stop the harness rather than improve a bundle.
  const { root, revision } = workspaceWith({ label: "knownleak" });
  write(
    path.join(revision, "generated-template.java"),
    'package com.demchaav.cv;\npublic final class GeneratedCvTemplate {\n' +
      '  static final String P = "graphcompose.revision.dir";\n}\n',
  );

  const output = publish(root);
  assert.match(output, /known leak/);
  assert.match(output, /graphcompose\.template\.dir/, "the report must say what to read instead");
  assert.ok(fs.existsSync(path.join(bundleOf(root), "template.json")), "a known leak must not stop the publish");
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

test("a bundle is the approved revision and nothing else", () => {
  // A template class renamed between revisions used to leave the old .java in
  // the bundle. It still compiles, so nothing downstream notices that the
  // published template ships two templates, one of them dead.
  const { root } = workspaceWith({ label: "stale" });
  publish(root);

  const bundle = bundleOf(root);
  const leftover = path.join(bundle, "src", "OldNameTemplate.java");
  write(leftover, "public final class OldNameTemplate {}\n");
  const orphanAsset = path.join(bundle, "assets", "icons", "no-longer-referenced.png");
  write(orphanAsset, "PNG");

  // publish() throws on a non-zero exit, so reaching the assertions is the pass.
  const output = publish(root);
  assert.ok(!fs.existsSync(leftover), `a renamed class survived the republish
${output}`);
  assert.ok(!fs.existsSync(orphanAsset), "an asset the data no longer names survived the republish");
  assert.match(output, /removed stale/, "the removal was not reported");

  // And what belongs is still there.
  assert.ok(fs.existsSync(path.join(bundle, "src", "NavySidebarCvTemplate.java")));
  assert.ok(fs.existsSync(path.join(bundle, "assets", "avatar.png")));
  assert.ok(fs.existsSync(path.join(bundle, "template.json")));
});

test("the README's hand-written half survives pruning", () => {
  // The publisher does not write README.md; approve-and-publish does, and the
  // half below its marker is the one part of a bundle a person authored.
  const { root } = workspaceWith({ label: "readme" });
  publish(root);

  const readme = path.join(bundleOf(root), "README.md");
  write(readme, ["# Navy CV", "", "## Design notes", "", "The headline derives from cap height.", ""].join("\n"));

  publish(root);
  assert.match(fs.readFileSync(readme, "utf8"), /derives from cap height/);
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

// --- layout -------------------------------------------------------------------
//
// The revision stays one file; the bundle does not. A person handed
// `templates/<id>/` has to maintain it, and a 1,000-line class with the theme,
// every region and every helper in it is not a project — so publishing splits it
// into the structure the document already has. When it cannot prove the split it
// publishes flat and says why, because a bundle that ships is worth more than a
// layout that is prettier.

/** A revision whose template has the shape a generated one has. */
function splittableTemplate() {
  return [
    "package com.demchaav.cv;",
    "",
    "/** A CV. */",
    "public final class GeneratedCvTemplate {",
    "",
    "    private static final double LABEL_SIZE = 8.65;",
    "",
    "    public void compose(DocumentSession document, NavyCvSpec spec) {",
    "        renderHeader(document, spec);",
    "        renderFooter(document, spec);",
    "    }",
    "",
    "    private void renderHeader(SectionBuilder section, NavyCvSpec spec) {",
    '        heading(section, "Header");',
    "    }",
    "",
    "    private void renderFooter(SectionBuilder section, NavyCvSpec spec) {",
    '        heading(section, "Footer");',
    "    }",
    "",
    "    private void heading(SectionBuilder section, String text) {",
    "        section.addParagraph(p -> p.text(text).size(LABEL_SIZE));",
    "    }",
    "}",
    "",
  ].join("\n");
}

test("a splittable template publishes as a project, not as one file", () => {
  const { root, revision } = workspaceWith({ label: "layout-structured" });
  write(path.join(revision, "generated-template.java"), splittableTemplate());

  const output = publish(root);
  assert.match(output, /layout\s+= structured/);

  const src = path.join(root, "templates", "navy-sidebar-cv", "src");
  assert.ok(fs.existsSync(path.join(src, "NavySidebarCvTemplate.java")), "the entry class stays at the top");
  assert.ok(fs.existsSync(path.join(src, "theme", "NavySidebarCvTheme.java")));
  assert.ok(fs.existsSync(path.join(src, "sections", "HeaderSection.java")));
  assert.ok(fs.existsSync(path.join(src, "sections", "FooterSection.java")));
  assert.ok(fs.existsSync(path.join(src, "composites", "Heading.java")));

  // The class rename reaches every emitted file, not only the entry class.
  const header = fs.readFileSync(path.join(src, "sections", "HeaderSection.java"), "utf8");
  assert.doesNotMatch(header, /GeneratedCvTemplate/);
});

test("the manifest records the layout, its parts and its sources", () => {
  const { root, revision } = workspaceWith({ label: "layout-manifest" });
  write(path.join(revision, "generated-template.java"), splittableTemplate());
  publish(root);

  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "templates", "navy-sidebar-cv", "template.json"), "utf8"),
  );

  assert.equal(manifest.layout, "structured");
  assert.equal(manifest.layoutReason, null);
  assert.equal(manifest.structure.sections.length, 2);
  assert.deepEqual(manifest.structure.composites, ["com.demchaav.cv.composites.Heading"]);
  assert.ok(manifest.sources.includes("sections/HeaderSection.java"));
  assert.ok(manifest.sources.includes("NavySidebarCvTemplate.java"));
});

test("a template the splitter cannot account for publishes flat, with the reason", () => {
  const { root, revision } = workspaceWith({ label: "layout-fallback" });
  write(
    path.join(revision, "generated-template.java"),
    splittableTemplate().replace(
      "    private static final double LABEL_SIZE = 8.65;",
      "    private final BusinessTheme theme;\n    private static final double LABEL_SIZE = 8.65;",
    ),
  );

  const output = publish(root);

  // Publishing must not fail because of this feature. `invoice-classic` has
  // exactly this shape, and a splitter that tried anyway would emit Java that
  // does not compile at the moment a user said "approve".
  assert.match(output, /layout\s+= flat \(instance field: theme /);

  const src = path.join(root, "templates", "navy-sidebar-cv", "src");
  assert.ok(fs.existsSync(path.join(src, "NavySidebarCvTemplate.java")));
  assert.ok(!fs.existsSync(path.join(src, "sections")));

  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "templates", "navy-sidebar-cv", "template.json"), "utf8"),
  );
  assert.equal(manifest.layout, "flat");
  assert.match(manifest.layoutReason, /instance field: theme/);
});

test("--layout flat opts out; --layout structured refuses instead of falling back", () => {
  const { root, revision } = workspaceWith({ label: "layout-flags" });
  write(path.join(revision, "generated-template.java"), splittableTemplate());

  const flat = publish(root, ["--layout", "flat"]);
  assert.match(flat, /layout\s+= flat \(--layout flat\)/);
  assert.ok(!fs.existsSync(path.join(root, "templates", "navy-sidebar-cv", "src", "sections")));

  const unsplittable = workspaceWith({ label: "layout-strict" });
  write(
    path.join(unsplittable.revision, "generated-template.java"),
    splittableTemplate().replace(
      "    private static final double LABEL_SIZE = 8.65;",
      "    private final BusinessTheme theme;",
    ),
  );
  const refused = failing(() => publish(unsplittable.root, ["--layout", "structured"]));
  assert.match(refused.output, /cannot be split: instance field: theme/);
});

test("switching a published bundle back to flat removes the sub-packages", () => {
  const { root, revision } = workspaceWith({ label: "layout-switch" });
  write(path.join(revision, "generated-template.java"), splittableTemplate());

  publish(root);
  const src = path.join(root, "templates", "navy-sidebar-cv", "src");
  assert.ok(fs.existsSync(path.join(src, "sections")));

  publish(root, ["--layout", "flat"]);

  // A bundle is the published form of one revision, not a directory that
  // accumulates. Sections left behind from an earlier layout would still
  // compile, so nothing downstream would notice them.
  assert.ok(!fs.existsSync(path.join(src, "sections")), "the old sections/ is gone");
  assert.ok(!fs.existsSync(path.join(src, "theme")), "the old theme/ is gone");
  assert.ok(fs.existsSync(path.join(src, "NavySidebarCvTemplate.java")));
});

test("an architecture plan names the sections; without one the method names do", () => {
  const withPlan = workspaceWith({ label: "layout-plan" });
  write(path.join(withPlan.revision, "generated-template.java"), splittableTemplate());
  write(
    path.join(withPlan.revision, "architecture-plan.json"),
    JSON.stringify({
      schemaVersion: 1,
      componentMapping: [{ region: "page-masthead", renderMethod: "renderHeader", notes: "why" }],
    }),
  );
  publish(withPlan.root);

  const src = path.join(withPlan.root, "templates", "navy-sidebar-cv", "src", "sections");
  assert.ok(fs.existsSync(path.join(src, "PageMastheadSection.java")), "the region names the class");
  // The plan enriches; it does not select. renderFooter is absent from the
  // mapping and is still a section.
  assert.ok(fs.existsSync(path.join(src, "FooterSection.java")));
});

test("the manifest lists the sources that survived the sweep, not the ones it deleted", () => {
  // `sources` is read off the directory, so a sweep that ran after the manifest
  // was written left it describing files that were already gone: republishing a
  // structured bundle as flat produced a template.json claiming 24 sources over
  // a src/ holding three.
  const { root, revision } = workspaceWith({ label: "layout-sources" });
  write(path.join(revision, "generated-template.java"), splittableTemplate());

  publish(root);
  publish(root, ["--layout", "flat"]);

  const bundle = path.join(root, "templates", "navy-sidebar-cv");
  const manifest = JSON.parse(fs.readFileSync(path.join(bundle, "template.json"), "utf8"));
  const onDisk = fs
    .readdirSync(path.join(bundle, "src"), { recursive: true })
    .map((f) => String(f).split(path.sep).join("/"))
    .filter((f) => f.endsWith(".java"))
    .sort();

  assert.deepEqual(manifest.sources, onDisk);
  assert.ok(!manifest.sources.some((f) => f.startsWith("sections/")), "a pruned source is still listed");
});

test("--layout with no value is a usage error, not a silent auto", () => {
  const { root, revision } = workspaceWith({ label: "layout-novalue" });
  write(path.join(revision, "generated-template.java"), splittableTemplate());

  // `parseArgs` gives `true` for a flag with no value; coercing that to the
  // default meant a caller who dropped the value got a structured bundle and no
  // diagnostic.
  const refused = failing(() => publish(root, ["--layout"]));
  assert.match(refused.output, /--layout needs a value/);
});
