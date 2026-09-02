#!/usr/bin/env node
/**
 * scripts/test/check-analysis.test.mjs — the fan-out rejoins on validated
 * artifacts, not on files being present.
 *
 * ## Why the distinction is the whole point
 *
 * Create phase 2 produces three artifacts concurrently. A file exists the
 * moment its writer opens it, so a join on existence lets the architecture plan
 * read a half-written analysis, believe it, and plan around a document it has
 * only partly seen. Nothing downstream reports that: a plan built on incomplete
 * discovery still renders. It renders the wrong thing.
 *
 * Every case here is therefore a file that is *there* and not *done*.
 *
 * Run with the built-in runner (no dependencies):
 *
 *   node --test scripts/test/
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "check-analysis.mjs");

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gcanalysis-${label}-`));
  temps.push(dir);
  return dir;
}

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

/** A minimal analysis that validates, so each case can break exactly one thing. */
const GEOMETRY = {
  schemaVersion: 1,
  // Shaped from a real analysis: the schema requires the reference's own
  // pixel size and aspect, not just the page in points.
  page: {
    format: "A4",
    orientation: "portrait",
    referencePx: { width: 1054, height: 1492 },
    aspect: 1.41556,
    sizePt: { width: 595.276, height: 841.89 },
    sizeSource: "measured-standard",
    pageCount: 1,
  },
  regions: [
    { id: "page-background", label: "Page chrome", page: 1, role: "background", bounds: { x: 0, y: 0, w: 1, h: 1 } },
  ],
  flow: { kind: "fixed", overflowExpectation: "The page is the artifact." },
};
const REQUEST = { icons: [], fonts: [{ role: "body", family: "Helvetica", source: "standard14" }] };
const DATA = { name: "A Person", title: "Engineer" };

/** A workspace with one project and one revision, filled to order. */
function workspace(
  label,
  { geometry = GEOMETRY, data = DATA, request = REQUEST, plan = null, manifest = null, project: projectExtra = {} } = {},
) {
  const host = tempDir(label);
  const root = path.join(host, "graphcompose-flow");
  const project = path.join(root, "projects", "demo");
  const revision = path.join(project, "revisions", "revision-001");

  writeJson(path.join(root, "flow.config.json"), { schemaVersion: 1 });
  writeJson(path.join(project, "template-project.json"), {
    id: "demo",
    displayName: "demo",
    docKind: "cv",
    targetGraphComposeVersion: "2.3.0",
    skillPack: "skills/versions/graphcompose-2.3",
    currentDraftRevisionId: "revision-001",
    currentApprovedRevisionId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    schemaVersion: 1,
    ...projectExtra,
  });
  writeJson(path.join(revision, "revision.json"), {
    id: "revision-001",
    parentRevisionId: null,
    status: "DRAFT",
    userRequest: "make a cv",
    targetGraphComposeVersion: "2.3.0",
    skillPack: "skills/versions/graphcompose-2.3",
    createdAt: "2026-09-01T00:00:00.000Z",
    artifacts: { userRequest: "user-request.md" },
    schemaVersion: 1,
  });
  if (geometry !== null) writeJson(path.join(revision, "visual-analysis.json"), geometry);
  if (data !== null) writeJson(path.join(revision, "cv-data.json"), data);
  if (request !== null) writeJson(path.join(revision, "asset-request.json"), request);
  if (plan !== null) writeJson(path.join(revision, "architecture-plan.json"), plan);
  if (manifest !== null) writeJson(path.join(revision, "assets-manifest.json"), manifest);
  return { root, revision };
}

function check(root) {
  const run = spawnSync(process.execPath, [CLI, "--project", "demo", "--root", root, "--json"], {
    encoding: "utf8",
  });
  let parsed = null;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    /* an error path */
  }
  return { status: run.status, parsed, out: `${run.stdout ?? ""}${run.stderr ?? ""}` };
}

const named = (parsed, name) => parsed.artifacts.find((a) => a.name === name);

test("three complete artifacts let the architecture plan start", () => {
  const { status, parsed, out } = check(workspace("complete").root);

  assert.equal(status, 0, out);
  assert.equal(parsed.complete, true);
  assert.equal(parsed.revision, "revision-001", "the draft was not resolved from the project");
  assert.ok(parsed.artifacts.every((a) => a.ok));
});

test("a geometry file that is there but does not validate holds the join", () => {
  // The case the whole check exists for: present, parseable, and missing the
  // regions every later stage addresses by id.
  const { root } = workspace("bad-geometry", { geometry: { schemaVersion: 1 } });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.equal(parsed.complete, false);
  assert.equal(named(parsed, "visual-analysis.json").ok, false);
  assert.match(named(parsed, "visual-analysis.json").detail, /fails visual-analysis\.schema\.json/);
  assert.equal(named(parsed, "asset-request.json").ok, true, "one bad artifact must not condemn the others");
});

test("an asset request missing its required halves holds the join", () => {
  const { root } = workspace("bad-request", { request: { icons: [] } });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.match(named(parsed, "asset-request.json").detail, /fails asset-request\.schema\.json/);
});

test("a data file that parsed and stayed empty is not done", () => {
  // An empty object is what a writer leaves when it opened the file and never
  // filled it — indistinguishable from finished if the join is on existence.
  const { root } = workspace("empty-data", { data: {} });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.equal(named(parsed, "cv-data.json").ok, false);
  assert.match(named(parsed, "cv-data.json").detail, /empty/);
});

test("truncated JSON is reported as truncated, not as absent", () => {
  const { root, revision } = workspace("truncated");
  fs.writeFileSync(path.join(revision, "asset-request.json"), '{ "icons": [', "utf8");
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.match(named(parsed, "asset-request.json").detail, /not valid JSON/);
});

test("an artifact nobody has written yet says so plainly", () => {
  const { root } = workspace("missing", { request: null });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.equal(named(parsed, "asset-request.json").detail, "not written yet");
});

test("inline data is complete, not 'not written yet'", () => {
  // `render.dataFileName: null` is a defined state — the Java carries the data
  // — and the barrier read it as a file nobody had written, so a project in
  // that state could never clear it. One in the corpus is.
  const { root } = workspace("inline", { data: null, project: { render: { dataFileName: null } } });
  const { status, parsed, out } = check(root);

  assert.equal(status, 0, out);
  assert.match(named(parsed, "<doc-kind>-data.json").detail, /inline/);
});

test("a data file that is not a document does not clear the join", () => {
  // `Object.keys` of a string is its indices, so a placeholder string reported
  // "13 top-level field(s)" and cleared the gate.
  const { root } = workspace("string-data", { data: "just a string" });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.match(named(parsed, "cv-data.json").detail, /not a document/);
});

test("--only answers for one artifact, so the resolver can start on a valid request", () => {
  // The workflow's sentence — "start it the moment the request validates" —
  // had no command behind it: the plan barrier answers for all three, so the
  // resolver either waited for the geometry beside it or started unchecked.
  const { root } = workspace("only", { geometry: { schemaVersion: 1 } });
  const run = spawnSync(
    process.execPath,
    [CLI, "--project", "demo", "--root", root, "--only", "asset-request.json", "--json"],
    { encoding: "utf8" },
  );
  const parsed = JSON.parse(run.stdout);

  assert.equal(run.status, 0, "a broken geometry file held the request's own answer");
  assert.equal(parsed.only, "asset-request.json");
  assert.equal(parsed.artifacts.length, 1);
});

test("a corrupt project file is an environment error with a message, not a stack trace", () => {
  const { root } = workspace("corrupt-project");
  fs.writeFileSync(path.join(root, "projects", "demo", "template-project.json"), '{ "id": "demo",', "utf8");
  const { status, out } = check(root);

  assert.equal(status, 2);
  assert.match(out, /template-project\.json is not readable/);
  assert.doesNotMatch(out, /at readJson/);
});

test("a flag with no value is a usage error, not a silent default", () => {
  const { root } = workspace("bare-flag");
  const run = spawnSync(process.execPath, [CLI, "--project", "demo", "--root", root, "--for"], { encoding: "utf8" });

  assert.equal(run.status, 2);
  assert.match(run.stderr, /--for needs a value/);
});

test("--help names every way to ask", () => {
  const run = spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8" });

  assert.match(run.stdout, /--for plan\|authoring/);
  assert.match(run.stdout, /--only <artifact>/);
});

test("the text report names what to re-run rather than what to work around", () => {
  const { root } = workspace("text", { data: {} });
  const run = spawnSync(process.execPath, [CLI, "--project", "demo", "--root", root], { encoding: "utf8" });

  assert.equal(run.status, 1);
  assert.match(run.stdout, /WAIT\s+cv-data\.json/);
  assert.match(run.stdout, /re-run what failed rather than working around it/);
});

// -------------------------------------------------------- authoring barrier ---

/**
 * A plan and a manifest that validate. Both are lifted from a real revision
 * rather than invented: hand-written fixtures failed their own schemas twice
 * here, on required fields — `pickedBy`, `templateSurface` — that only a real
 * artifact carries.
 */
const PLAN = {
  "schemaVersion": 1,
  "targetGraphComposeVersion": "2.2.1",
  "templateSurface": {
    "lane": "V2 layered",
    "documentKind": "cv",
    "upstreamCheatsheet": "skills/versions/graphcompose-2.2/guides/09-recipe-cv-and-cover-letter.md"
  },
  "componentMapping": [
    {
      "region": "page-background",
      "renderMethod": "renderPageChrome",
      "primitives": [
        "DocumentSession.pageBackgrounds",
        "PageBackgroundFill.leftColumn",
        "PageBackgroundFill.rightColumn"
      ],
      "notes": "Both columns reach all four paper edges on every page, which is the page-background contract and not a container fill. A fillColor on the sidebar section would stop where its content stops and leave the charcoal short of the bottom edge — the exact failure backgrounds-and-panels.md opens with."
    }
  ],
  "baseConstants": [
    {
      "name": "PAGE_WIDTH",
      "value": 595.276,
      "derivation": "DocumentPageSize.A4.width(). Every horizontal dimension below is a fraction of this."
    },
    {
      "name": "SIDEBAR_WEIGHT",
      "value": 0.3197,
      "derivation": "Measured 337px of 1054. The main column is 1 - SIDEBAR_WEIGHT, and the page-background columns take the same two numbers, so the fill and the content column cannot drift apart."
    },
    {
      "name": "SIDEBAR_PAD",
      "value": 17.0,
      "derivation": "0.0285 x PAGE_WIDTH (30px of 1054). Applied left and right; the sidebar's content width is SIDEBAR_WEIGHT x PAGE_WIDTH - 2 x SIDEBAR_PAD."
    },
    {
      "name": "MAIN_PAD_LEFT",
      "value": 23.7,
      "derivation": "0.0398 x PAGE_WIDTH (42px), the gap between the sidebar edge and the main column's text."
    },
    {
      "name": "MAIN_PAD_RIGHT",
      "value": 28.8,
      "derivation": "0.0484 x PAGE_WIDTH (51px), fixed by where the EXPERIENCE hairline stops."
    },
    {
      "name": "MAIN_CONTENT_WIDTH",
      "value": "(1 - SIDEBAR_WEIGHT) * PAGE_WIDTH - MAIN_PAD_LEFT - MAIN_PAD_RIGHT",
      "derivation": "352.5pt. The masthead rule, the credential column weights and the timeline's date/rail/content split are all fractions of this rather than separate measurements."
    },
    {
      "name": "TIMELINE_DATE_WEIGHT",
      "value": 0.194,
      "derivation": "Date column as a fraction of MAIN_CONTENT_WIDTH; the marker column is MARKER_DIAMETER wide and the content takes the rest."
    },
    {
      "name": "CREDENTIAL_LEFT_WEIGHT",
      "value": 0.402,
      "derivation": "Certifications column, measured 251px of the 624px main content. The gutter is 0.124 and achievements 0.474; the three sum to 1 by construction."
    },
    {
      "name": "BODY_SIZE",
      "value": 10.5,
      "derivation": "Everything typographic is a multiple: surname 4.3x, given name 3.5x, section heading 0.85x, meta 0.8x."
    },
    {
      "name": "MARKER_DIAMETER",
      "value": 6.2,
      "derivation": "Independent. Measured 11px; the marker is a fixed mark, not a scaled one."
    },
    {
      "name": "RATING_DOT_DIAMETER",
      "value": 4.5,
      "derivation": "Independent. Measured 8px, at a 8.2pt pitch across five dots."
    },
    {
      "name": "CONTACT_ICON_SIZE",
      "value": 9.0,
      "derivation": "Independent, and read from assets-manifest.json's pointSize rather than written in Java, so the flow decides icon size."
    }
  ],
  "themeTokens": [
    {
      "token": "SIDEBAR",
      "value": "#272D32",
      "role": "sidebar-background"
    },
    {
      "token": "PAPER",
      "value": "#FEFEFE",
      "role": "page-background"
    },
    {
      "token": "ACCENT",
      "value": "#BA9458",
      "role": "accent"
    },
    {
      "token": "INK",
      "value": "#272D32",
      "role": "body-text"
    },
    {
      "token": "SIDEBAR_INK",
      "value": "#FBFBFB",
      "role": "sidebar-text"
    },
    {
      "token": "RULE",
      "value": "#DADADB",
      "role": "rule"
    },
    {
      "token": "SIDEBAR_RULE",
      "value": "#3D4345",
      "role": "sidebar-rule"
    },
    {
      "token": "RATING_EMPTY",
      "value": "#777A7D",
      "role": "rating-empty"
    },
    {
      "token": "BODY_FONT",
      "value": "FontName.LATO",
      "role": "body"
    }
  ],
  "dataModel": {
    "specClass": "com.demcha.examples.cv.CharcoalGoldCvSpec",
    "providerClass": "com.demcha.examples.cv.CharcoalGoldCvSpecProvider#create()",
    "dataFile": "cv-data.json"
  },
  "pagination": {
    "pageModel": "uniform",
    "keepRules": [
      {
        "region": "experience",
        "rule": "keepTogether",
        "why": "An entry is a date, a marker and its achievement list on one rail. Split across a page the marker keeps its date and loses its bullets, and the rail restarts at the top of the next page under no marker at all. The block is curated to one page, so this rule never fires on the sample — which is exactly why it has to be declared rather than discovered."
      },
      {
        "region": "certifications",
        "rule": "keepTogether",
        "why": "A credential is four lines and an icon; there is no reading of it that survives being cut in half, and the paired achievements column would then sit alongside a fragment."
      },
      {
        "region": "achievements",
        "rule": "keepTogether",
        "why": "Same as certifications, and the two columns must break together or not at all."
      },
      {
        "region": "technical-tools",
        "rule": "keepWithNext",
        "why": "The heading and its one line of tools are a two-line block; orphaning the heading at the foot of a page would leave a labelled nothing."
      }
    ],
    "notes": "The reference is one page and the content is curated to fit it, so there are no explicit breaks and no per-page margin rules. The keep rules above are the answer to what happens when someone edits this template for a candidate with more to say — the sample render never exercises them, which is why they are decided here instead of after the first overflow."
  }
};

const ICON = {
  "iconSet": "mdi:phone-outline",
  "prefix": "mdi",
  "name": "phone-outline",
  "file": "assets/icons/phone.svg",
  "format": "svg",
  "fallbackReason": null,
  "size": null,
  "pointSize": 9,
  "color": "#BA9458",
  "pickedBy": "explicit",
  "visualHint": null,
  "droppedSvgContent": null
};

const FONT = {
  role: "body",
  family: "Helvetica",
  fontName: "HELVETICA",
  weights: [400],
  source: "standard14",
  status: "ok",
  registration: "default-fonts",
};

/**
 * A manifest carrying the icon tokens and the font roles named. Both halves,
 * because both are what the template reads: the request asks for a body face by
 * role and the Java refers to that role, so a manifest that resolved every icon
 * and no font is as unreadable as one missing an icon.
 */
const manifestFor = (tokens, roles = ["body"]) => ({
  schemaVersion: "1.0.0",
  generatedAt: "2026-09-01T00:00:00.000Z",
  revisionDir: ".",
  icons: Object.fromEntries(tokens.map((t) => [t, { ...ICON, name: t, file: `assets/icons/${t}.svg` }])),
  fonts: Object.fromEntries(roles.map((r) => [r, { ...FONT, role: r }])),
});
/** What tools/asset-resolver writes for a Google face: a record, never an absence. */
const MANUAL_DROP = {
  role: "display",
  family: "Barlow Condensed",
  fontName: null,
  weights: [400, 700],
  source: "google-fonts",
  status: "manual_drop_required",
  registration: "file-resource",
  notes:
    'download TTF for "Barlow Condensed" weights 400,700 and drop into assets/fonts/. Template must register via FontFamilyDefinition.files(...).',
};
/** And for a family the requested source does not carry: the same status, no registration. */
const NOT_BUNDLED = {
  ...MANUAL_DROP,
  source: "graphcompose-bundled",
  registration: null,
  notes:
    'family "Barlow Condensed" is not bundled in GraphCompose 1.6 DefaultFonts; pick a bundled family from DefaultFonts.googleFamilies() or set source="google-fonts" and drop TTF files in assets/fonts/',
};
const manifestWithFonts = (tokens, fonts) => ({ ...manifestFor(tokens, []), fonts });
const REQUEST_WITH = (tokens) => ({
  icons: tokens.map((t) => ({ token: t, query: t, pointSize: 9 })),
  fonts: [{ role: "body", family: "Helvetica", source: "standard14" }],
});

function checkFor(root, barrier) {
  const run = spawnSync(
    process.execPath,
    [CLI, "--project", "demo", "--root", root, "--for", barrier, "--json"],
    { encoding: "utf8" },
  );
  let parsed = null;
  try {
    parsed = JSON.parse(run.stdout);
  } catch {
    /* an error path */
  }
  return { status: run.status, parsed, out: `${run.stdout ?? ""}${run.stderr ?? ""}` };
}

test("the plan barrier does not wait for the manifest", () => {
  // The whole point of moving resolution earlier: it reads only the request, so
  // the plan must not be blocked on it. Across nineteen recorded runs the
  // manifest landed a median 26 minutes after its own input was already valid.
  const { root } = workspace("plan-no-manifest", { plan: null, manifest: null });
  const { status, parsed } = checkFor(root, "plan");

  assert.equal(status, 0, "the architecture plan was made to wait for asset resolution");
  assert.equal(parsed.barrier, "plan");
  assert.ok(!parsed.artifacts.some((a) => a.name === "assets-manifest.json"));
});

test("the authoring barrier waits for the plan and the manifest", () => {
  const { root } = workspace("authoring-complete", {
    request: REQUEST_WITH(["phone", "email"]),
    plan: PLAN,
    manifest: manifestFor(["phone", "email"]),
  });
  const { status, parsed, out } = checkFor(root, "authoring");

  assert.equal(status, 0, out);
  assert.equal(parsed.barrier, "authoring");
  assert.ok(parsed.artifacts.some((a) => a.name === "architecture-plan.json" && a.ok));
  assert.ok(parsed.artifacts.some((a) => a.name === "assets-manifest.json" && a.ok));
});

test("authoring is held when the manifest has not been written", () => {
  const { root } = workspace("authoring-no-manifest", { plan: PLAN, manifest: null });
  const { status, parsed } = checkFor(root, "authoring");

  assert.equal(status, 1);
  assert.equal(named(parsed, "assets-manifest.json").detail, "not written yet");
});

test("an icon the resolver never returned is caught, though both files validate", () => {
  // The disagreement no schema can see. Request and manifest are each perfectly
  // shaped; the template simply has no record to read for `website`, and the
  // icon goes missing from a render nobody flagged.
  const { root } = workspace("token-dropped", {
    request: REQUEST_WITH(["phone", "email", "website"]),
    plan: PLAN,
    manifest: manifestFor(["phone", "email"]),
  });
  const { status, parsed } = checkFor(root, "authoring");

  assert.equal(status, 1);
  const check = named(parsed, "requested assets resolved");
  assert.equal(check.ok, false);
  assert.match(check.detail, /website/);
  assert.ok(
    parsed.artifacts.every((a) => a.name === "requested assets resolved" || a.ok),
    "the schemas were happy, which is exactly why this check exists",
  );
});

test("a face that needs a manual drop is reported, and authoring proceeds", () => {
  // What the resolver actually writes for a Google face: a record under the
  // role with status manual_drop_required and fontName null — never an absent
  // key. The first version of this check read key presence, so it could not
  // fire; and the manifest schema refused fontName: null, so the run was held
  // with advice ("re-run what failed") that re-produced the same manifest.
  // Five manifests in the real-run corpus carry this record today.
  const { root } = workspace("manual-drop", {
    request: {
      icons: [],
      fonts: [
        { role: "body", family: "Helvetica", source: "standard14" },
        { role: "display", family: "Barlow Condensed", source: "google-fonts" },
      ],
    },
    plan: PLAN,
    manifest: manifestWithFonts([], { body: FONT, display: MANUAL_DROP }),
  });
  const { status, parsed, out } = checkFor(root, "authoring");

  assert.equal(status, 0, out);
  assert.equal(named(parsed, "assets-manifest.json").ok, true, "the resolver's own record failed the manifest schema");
  const check = named(parsed, "requested assets resolved");
  assert.equal(check.ok, true);
  assert.match(check.detail, /manual drop/);
  assert.match(check.detail, /display/);
  assert.match(check.detail, /assets\/fonts/);
});

test("a family its source does not carry holds authoring with the resolver's note", () => {
  // The other thing wearing the same status: registration null, because the
  // request named a family graphcompose-bundled does not ship. Nothing to drop
  // — the request is what needs fixing, and the note says how.
  const { root } = workspace("not-bundled", {
    request: {
      icons: [],
      fonts: [
        { role: "body", family: "Helvetica", source: "standard14" },
        { role: "display", family: "Barlow Condensed", source: "graphcompose-bundled" },
      ],
    },
    plan: PLAN,
    manifest: manifestWithFonts([], { body: FONT, display: NOT_BUNDLED }),
  });
  const { status, parsed } = checkFor(root, "authoring");

  assert.equal(status, 1);
  assert.equal(named(parsed, "assets-manifest.json").ok, true);
  const check = named(parsed, "requested assets resolved");
  assert.equal(check.ok, false);
  assert.match(check.detail, /display/);
  assert.match(check.detail, /not bundled/);
});

test("a mis-shaped request is reported, not thrown", () => {
  // The cross-check used to run on anything that parsed, and a request whose
  // `icons` was an object threw a bare TypeError — exit 1, empty stdout, and
  // the "fails asset-request.schema.json" line that would have explained it
  // never written.
  const { root } = workspace("icons-object", {
    request: { icons: {}, fonts: [] },
    plan: PLAN,
    manifest: manifestFor([]),
  });
  const { status, parsed, out } = checkFor(root, "authoring");

  assert.equal(status, 1);
  assert.ok(parsed, `no report came back:\n${out}`);
  assert.match(named(parsed, "asset-request.json").detail, /fails asset-request\.schema\.json/);
  assert.equal(named(parsed, "requested assets resolved"), undefined, "the cross-check ran on a request that did not validate");
});

test("a role the manifest has no record for at all is held", () => {
  // The resolver never produces this — it writes a record under every role —
  // but a hand-edited manifest can, and a role with no record is a role the
  // Java cannot read.
  const { root } = workspace("font-dropped", {
    request: {
      icons: [{ token: "phone", query: "phone", pointSize: 9 }],
      fonts: [
        { role: "body", family: "Helvetica", source: "standard14" },
        { role: "display", family: "Barlow Condensed", source: "graphcompose-bundled" },
      ],
    },
    plan: PLAN,
    manifest: manifestFor(["phone"], ["body"]),
  });
  const { status, parsed } = checkFor(root, "authoring");

  assert.equal(status, 1);
  const check = named(parsed, "requested assets resolved");
  assert.equal(check.ok, false);
  assert.match(check.detail, /display/);
});

test("--for takes only the two barriers that exist", () => {
  const { root } = workspace("bad-barrier");
  const run = spawnSync(
    process.execPath,
    [CLI, "--project", "demo", "--root", root, "--for", "render"],
    { encoding: "utf8" },
  );

  assert.equal(run.status, 2);
  assert.match(run.stderr, /--for takes plan or authoring/);
});
