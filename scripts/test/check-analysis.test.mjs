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
  // Carried by the minimum because the plan barrier asks, once a reference is
  // on disk, how each face was chosen. "Assumed, and here is why" is the honest
  // answer for these fixtures: their reference is a handful of synthetic pixels
  // with no text in it, so there is no crop to match a family against. Cases
  // that are about typography strip this out rather than the other way round.
  typography: {
    roles: [
      { role: "headings", fontName: "HELVETICA", source: "assumed", why: "the fixture reference carries no text" },
      { role: "body", fontName: "HELVETICA", source: "assumed", why: "the fixture reference carries no text" },
    ],
  },
  flow: { kind: "fixed", overflowExpectation: "The page is the artifact." },
};
const REQUEST = { icons: [], fonts: [{ role: "body", family: "Helvetica", source: "standard14" }] };
const DATA = { name: "A Person", title: "Engineer" };

/** A workspace with one project and one revision, filled to order. */
function workspace(
  label,
  {
    geometry = GEOMETRY,
    data = DATA,
    request = REQUEST,
    plan = null,
    manifest = null,
    project: projectExtra = {},
    // Reference page bytes. Most cases leave this null: with no reference there
    // is nothing to fingerprint, and the provenance check reports that rather
    // than failing, so the older cases stay about what they were about.
    reference = null,
  } = {},
) {
  const host = tempDir(label);
  const root = path.join(host, "graphcompose-flow");
  const project = path.join(root, "projects", "demo");
  const revision = path.join(project, "revisions", "revision-001");
  if (reference !== null) {
    fs.mkdirSync(path.join(project, "reference"), { recursive: true });
    fs.writeFileSync(path.join(project, "reference", "reference.png"), reference);
  }

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

/**
 * The analysis that goes with a request naming icons. A request that names
 * icons beside an analysis describing none is now its own failure — a run
 * resolved 33 and wrote `icons: []` — so a fixture about something else has to
 * be consistent on this point or it tests the contradiction instead.
 */
const GEOMETRY_WITH_ICONS = (tokens) => ({
  ...GEOMETRY,
  icons: tokens.map((t) => ({ id: t, sizeRelativeToText: 1.2, verticalAlign: "center", inline: true })),
});

/** And the plan that owns them, since a measured icon must be claimed by one method. */
const PLAN_WITH_ICONS = (tokens) => ({
  ...PLAN,
  componentMapping: PLAN.componentMapping.map((m, i) => (i === 0 ? { ...m, icons: tokens } : m)),
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
    geometry: GEOMETRY_WITH_ICONS(["phone", "email"]),
    request: REQUEST_WITH(["phone", "email"]),
    plan: PLAN_WITH_ICONS(["phone", "email"]),
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
    geometry: GEOMETRY_WITH_ICONS(["phone", "email", "website"]),
    request: REQUEST_WITH(["phone", "email", "website"]),
    plan: PLAN_WITH_ICONS(["phone", "email", "website"]),
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

// ---------------------------------------------------------------------------
// Provenance: the analysis has to describe THIS project's reference.
//
// Validating only ever said the document was well-shaped. A run copied another
// project's revision folder in, landed a byte-identical analysis, and passed
// this barrier without discovery having executed.
// ---------------------------------------------------------------------------

import { computeFingerprint } from "../lib/reference-fingerprint.mjs";

const REFERENCE_BYTES = "the reference image bytes";

test("with a reference on disk, an analysis carrying no provenance holds the join", () => {
  const { root } = workspace("no-provenance", { reference: REFERENCE_BYTES });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.equal(parsed.complete, false);
  assert.equal(named(parsed, "visual-analysis.json").ok, false);
  assert.match(named(parsed, "visual-analysis.json").detail, /carries no provenance/);
});

test("a correctly stamped analysis passes, and says so", () => {
  const { root, revision } = workspace("stamped", { reference: REFERENCE_BYTES });
  const projectDir = path.join(root, "projects", "demo");
  const file = path.join(revision, "visual-analysis.json");
  writeJson(file, {
    ...JSON.parse(fs.readFileSync(file, "utf8")),
    provenance: computeFingerprint({ projectDir, projectId: "demo" }),
  });

  const { status, parsed, out } = check(root);
  assert.equal(status, 0, out);
  assert.equal(named(parsed, "visual-analysis.json").ok, true);
  assert.match(named(parsed, "visual-analysis.json").detail, /describes this project's reference/);
});

test("an analysis stamped in another workspace is refused — the incident", () => {
  // Same project id, same reference bytes, different workspace: exactly the
  // shape of the copy that got through.
  const origin = workspace("incident-origin", { reference: REFERENCE_BYTES });
  const here = workspace("incident-here", { reference: REFERENCE_BYTES });

  const stolen = computeFingerprint({
    projectDir: path.join(origin.root, "projects", "demo"),
    projectId: "demo",
  });
  const file = path.join(here.revision, "visual-analysis.json");
  writeJson(file, { ...JSON.parse(fs.readFileSync(file, "utf8")), provenance: stolen });

  const { status, parsed } = check(here.root);
  assert.equal(status, 1);
  assert.equal(named(parsed, "visual-analysis.json").ok, false);
  assert.match(named(parsed, "visual-analysis.json").detail, /DIFFERENT workspace/);
});

test("an analysis of a different image is refused", () => {
  const { root, revision } = workspace("other-image", { reference: REFERENCE_BYTES });
  const other = workspace("other-image-source", { reference: "a completely different picture" });
  const stamp = computeFingerprint({
    projectDir: path.join(other.root, "projects", "demo"),
    projectId: "demo",
  });
  const mine = computeFingerprint({ projectDir: path.join(root, "projects", "demo"), projectId: "demo" });

  const file = path.join(revision, "visual-analysis.json");
  // Same project, same workspace — only the image the analysis describes differs.
  writeJson(file, {
    ...JSON.parse(fs.readFileSync(file, "utf8")),
    provenance: { ...stamp, workspace: mine.workspace },
  });

  const { status, parsed } = check(root);
  assert.equal(status, 1);
  assert.match(named(parsed, "visual-analysis.json").detail, /different image/);
});

test("a project with no reference is not held to a fingerprint it cannot have", () => {
  const { status, parsed, out } = check(workspace("no-reference").root);
  assert.equal(status, 0, out);
  assert.match(named(parsed, "visual-analysis.json").detail, /no reference on disk/);
});

// ---------------------------------------------------------------------------
// Icons: a request that names them and an analysis that describes none cannot
// both be right. A run resolved 33 icons and wrote `icons: []` — the same thing
// `spacing` and `typography` did before, because what is optional gets omitted.
// ---------------------------------------------------------------------------

test("33 icons requested and none described holds the join", () => {
  const { root } = workspace("icons-omitted", { request: REQUEST_WITH(["phone", "email", "website"]) });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.equal(named(parsed, "icons described").ok, false);
  assert.match(named(parsed, "icons described").detail, /names 3 icon\(s\).*describes\s+none/s);
  // The reason it matters, not just the count.
  assert.match(named(parsed, "icons described").detail, /emitted as a glyph at text size/);
});

test("a request naming no icons is not asked to describe any", () => {
  const { status, parsed, out } = check(workspace("icons-none").root);
  assert.equal(status, 0, out);
  assert.match(named(parsed, "icons described").detail, /no icons requested/);
});

test("described icons that match the request clear it", () => {
  const { root } = workspace("icons-described", {
    geometry: GEOMETRY_WITH_ICONS(["phone", "email"]),
    request: REQUEST_WITH(["phone", "email"]),
  });
  const { status, parsed, out } = check(root);

  assert.equal(status, 0, out);
  assert.match(named(parsed, "icons described").detail, /2 of 2 requested icon\(s\) described/);
});

test("an icon id matching no requested token is caught", () => {
  // A typo here points the plan's `icons` claim at nothing.
  const { root } = workspace("icons-typo", {
    geometry: GEOMETRY_WITH_ICONS(["phone", "emial"]),
    request: REQUEST_WITH(["phone", "email"]),
  });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.equal(named(parsed, "icons described").ok, false);
  assert.match(named(parsed, "icons described").detail, /emial/);
});

// ---------------------------------------------------------------------------
// Panels, and fills the reference can settle.
//
// A run described three containers and left out the one a reader complained
// about twice — the dark monogram block, role "panel" — so nothing measured its
// corner. On another container it got shape, radius, sizing and repeats right
// and `fill.present` wrong, and that field was the first thing anyone noticed.
// ---------------------------------------------------------------------------

import { createRequire } from "node:module";

const PANEL_REGION = {
  id: "sidebar-header",
  label: "Monogram panel",
  page: 1,
  role: "panel",
  bounds: { x: 0, y: 0, w: 0.28, h: 0.14 },
};

const CONTAINER = (extra = {}) => ({
  container: "competency-card",
  ownedContent: "icon and label",
  relationship: "an icon and a label share one row",
  region: "sidebar-competencies",
  bounds: { x: 0.2, y: 0.2, w: 0.6, h: 0.2 },
  shape: "rounded-rectangle",
  cornerRadiusRatio: 0.09,
  sizing: "fill-parent",
  fill: { present: false },
  stroke: { present: true },
  ...extra,
});

test("a region the analysis calls a panel must be described as a container", () => {
  const { root } = workspace("panel-undescribed", {
    geometry: { ...GEOMETRY, regions: [...GEOMETRY.regions, PANEL_REGION] },
  });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.equal(named(parsed, "panels described").ok, false);
  assert.match(named(parsed, "panels described").detail, /sidebar-header/);
  assert.match(named(parsed, "panels described").detail, /A panel IS a shape/);
});

test("a panel with an entry against it clears, and a document with no panels is not asked", () => {
  const { root } = workspace("panel-described", {
    geometry: {
      ...GEOMETRY,
      regions: [...GEOMETRY.regions, PANEL_REGION],
      shapeOwnership: [CONTAINER({ container: "monogram-panel", region: "sidebar-header" })],
    },
  });
  const { status, parsed, out } = check(root);
  assert.equal(status, 0, out);
  assert.match(named(parsed, "panels described").detail, /1 panel region\(s\)/);

  const bare = check(workspace("panel-none").root);
  assert.match(named(bare.parsed, "panels described").detail, /no panel regions/);
});

/** A page of `ground` with one bordered box, written as a real PNG. */
function referencePng(file, { filled }) {
  const require = createRequire(path.join(repoRoot, "tools", "visual-diff", "package.json"));
  const { PNG } = require("pngjs");
  const png = new PNG({ width: 200, height: 200 });
  const put = (x, y, c) => {
    const i = (200 * y + x) * 4;
    [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]] = [...c, 255];
  };
  for (let y = 0; y < 200; y += 1) for (let x = 0; x < 200; x += 1) put(x, y, [253, 241, 237]);
  // The container at bounds {0.2, 0.2, 0.6, 0.2} => x 40..160, y 40..80.
  for (let y = 40; y < 80; y += 1) {
    for (let x = 40; x < 160; x += 1) {
      const edge = x < 41 || x >= 159 || y < 41 || y >= 79;
      if (edge) put(x, y, [243, 206, 197]);
      else if (filled) put(x, y, [255, 255, 255]);
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

/**
 * Write the reference, then stamp the analysis for it. Provenance is computed
 * from the reference on disk, so a fixture that writes the image after the
 * analysis has to re-stamp or it fails a different check than it is testing.
 */
function referenceFor(root, revision, options) {
  const projectDir = path.join(root, "projects", "demo");
  referencePng(path.join(projectDir, "reference", "reference.png"), options);
  const file = path.join(revision, "visual-analysis.json");
  writeJson(file, {
    ...JSON.parse(fs.readFileSync(file, "utf8")),
    provenance: computeFingerprint({ projectDir, projectId: "demo" }),
  });
}

test("a fill the reference contradicts is refused, and the pixels are quoted", () => {
  // The exact error: an unfilled container claimed as filled.
  const { root, revision } = workspace("fill-wrong", {
    geometry: { ...GEOMETRY, shapeOwnership: [CONTAINER({ fill: { present: true } })] },
    reference: "placeholder",
  });
  referenceFor(root, revision, { filled: false });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.equal(named(parsed, "fill claims measured").ok, false);
  assert.match(named(parsed, "fill claims measured").detail, /claims a fill/);
  assert.match(named(parsed, "fill claims measured").detail, /the same ground, so it paints nothing/);
  assert.match(named(parsed, "fill claims measured").detail, /rgb\(/, "the measurement, not just a verdict");
});

test("a fill claim the reference agrees with passes, either way round", () => {
  for (const filled of [false, true]) {
    const { root, revision } = workspace(`fill-ok-${filled}`, {
      geometry: { ...GEOMETRY, shapeOwnership: [CONTAINER({ fill: { present: filled } })] },
      reference: "placeholder",
    });
    referenceFor(root, revision, { filled });
    const { status, parsed, out } = check(root);

    assert.equal(status, 0, out);
    assert.match(named(parsed, "fill claims measured").detail, /agree with the reference/);
  }
});

test("a missing fill claim is refused as unfilled when the reference says it paints", () => {
  const { root, revision } = workspace("fill-missing", {
    geometry: { ...GEOMETRY, shapeOwnership: [CONTAINER({ fill: { present: false } })] },
    reference: "placeholder",
  });
  referenceFor(root, revision, { filled: true });
  const { parsed } = check(root);

  assert.equal(named(parsed, "fill claims measured").ok, false);
  assert.match(named(parsed, "fill claims measured").detail, /it does paint/);
});

test("with no reference on disk the fill claim is reported unmeasured, not judged", () => {
  const { root } = workspace("fill-no-reference", {
    geometry: { ...GEOMETRY, shapeOwnership: [CONTAINER({ fill: { present: true } })] },
  });
  const { status, parsed, out } = check(root);

  assert.equal(status, 0, out);
  assert.match(named(parsed, "fill claims measured").detail, /no reference on disk/);
});

// ------------------------------------------- palette agrees with containers ---

test("THE CASE: a palette clause claiming a fill the container is measured without", () => {
  // Both fields as the failing analysis wrote them, in the first write.
  const { root } = workspace("palette-contradiction", {
    geometry: {
      ...GEOMETRY,
      shapeOwnership: [CONTAINER({ container: "competency-pill", fill: { present: false } })],
      colors: [
        { role: "page-bg", value: "#ffffff", usedIn: "main content area background, competency boxes fill" },
      ],
    },
  });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.equal(named(parsed, "palette agrees with containers").ok, false);
  assert.match(named(parsed, "palette agrees with containers").detail, /measured as unfilled/);
  assert.match(named(parsed, "palette agrees with containers").detail, /competency boxes fill/);
});

test("a palette that describes the same containers honestly clears", () => {
  const { root } = workspace("palette-honest", {
    geometry: {
      ...GEOMETRY,
      shapeOwnership: [CONTAINER({ container: "competency-pill", fill: { present: false } })],
      colors: [
        { role: "border", value: "#f0b8a8", usedIn: "borders of the competency pills" },
        { role: "sidebar-bg", value: "#fef2ef", usedIn: "sidebar background surface" },
      ],
    },
  });
  const { status, parsed, out } = check(root);

  assert.equal(status, 0, out);
  assert.equal(named(parsed, "palette agrees with containers").ok, true);
});

// --------------------------------------------------------- corner measured ---
//
// The identity panel has three square corners and one strongly rounded
// bottom-right. Two models read it and wrote 0 and 0.18 — opposite errors from
// the same cause, a field that held one number for a shape that has no single
// radius. One of them had written the truth in `notes`, where nothing reads it.

/** A page with one box on it, rounded per corner in pixels. */
function cornerReferencePng(file, radii = {}) {
  const require = createRequire(path.join(repoRoot, "tools", "visual-diff", "package.json"));
  const { PNG } = require("pngjs");
  const png = new PNG({ width: 200, height: 200 });
  const put = (x, y, c) => {
    const i = (200 * y + x) * 4;
    [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]] = [...c, 255];
  };
  for (let y = 0; y < 200; y += 1) for (let x = 0; x < 200; x += 1) put(x, y, [253, 241, 237]);

  // bounds {0.2, 0.2, 0.6, 0.5} => x 40..160, y 40..140, short side 100px.
  const box = { x0: 40, y0: 40, x1: 160, y1: 140 };
  for (let y = box.y0; y < box.y1; y += 1) {
    for (let x = box.x0; x < box.x1; x += 1) {
      const left = x - box.x0;
      const right = box.x1 - 1 - x;
      const top = y - box.y0;
      const bottom = box.y1 - 1 - y;
      const [name, cx, cy] =
        left <= right && top <= bottom
          ? ["topLeft", left, top]
          : left > right && top <= bottom
            ? ["topRight", right, top]
            : left > right
              ? ["bottomRight", right, bottom]
              : ["bottomLeft", left, bottom];
      const r = radii[name] ?? 0;
      if (r > 0 && cx < r && cy < r && Math.hypot(r - cx, r - cy) > r) continue;
      put(x, y, [2, 50, 45]);
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

/** A panel over that box, with whatever radius claim the case is about. */
const PANEL = (cornerRadiusRatio) => ({
  container: "identity-panel",
  ownedContent: "NB monogram",
  relationship: "the dark panel owns the identity marks",
  region: "sidebar-identity",
  bounds: { x: 0.2, y: 0.2, w: 0.6, h: 0.5 },
  shape: "rounded-rectangle",
  cornerRadiusRatio,
  sizing: "fill-parent",
  fill: { present: true, color: "#02322d" },
  stroke: { present: false },
});

/** Build a workspace whose reference carries the given per-corner radii. */
function cornerCase(label, cornerRadiusRatio, radii) {
  const { root, revision } = workspace(label, {
    geometry: { ...GEOMETRY, shapeOwnership: [PANEL(cornerRadiusRatio)] },
    reference: "placeholder",
  });
  const projectDir = path.join(root, "projects", "demo");
  cornerReferencePng(path.join(projectDir, "reference", "reference.png"), radii);
  const file = path.join(revision, "visual-analysis.json");
  writeJson(file, {
    ...JSON.parse(fs.readFileSync(file, "utf8")),
    provenance: computeFingerprint({ projectDir, projectId: "demo" }),
  });
  return root;
}

test("THE CASE: one number over corners the reference rounds differently is held", () => {
  // GPT's answer, against GPT's own reference: 0.18 everywhere on a panel whose
  // three other corners are square.
  const root = cornerCase("corner-uniform", 0.18, { bottomRight: 30 });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.equal(named(parsed, "corner claims measured").ok, false);
  assert.match(named(parsed, "corner claims measured").detail, /rounds differently/);
  assert.match(named(parsed, "corner claims measured").detail, /name them instead of averaging them/);
  assert.match(named(parsed, "corner claims measured").detail, /bottomRight 0\.3/, "the measurement, not just a verdict");
});

test("the other model's opposite error is held too, by the same check", () => {
  // Gemini's answer: 0, on the same panel. A single number that happens to be
  // right about three corners and wrong about the one that carries the design.
  const root = cornerCase("corner-zero", 0, { bottomRight: 30 });
  const { parsed } = check(root);

  assert.equal(named(parsed, "corner claims measured").ok, false);
  assert.match(named(parsed, "corner claims measured").detail, /rounds differently/);
});

test("naming the corners clears it, which is the whole point of the change", () => {
  const root = cornerCase("corner-named", { bottomRight: 0.3 }, { bottomRight: 30 });
  const { status, parsed, out } = check(root);

  assert.equal(status, 0, out);
  assert.equal(named(parsed, "corner claims measured").ok, true);
  assert.match(named(parsed, "corner claims measured").detail, /agree with the reference/);
});

test("a per-corner claim the reference contradicts is held, naming the corner", () => {
  const root = cornerCase("corner-wrong", { topLeft: 0.35 }, { bottomRight: 30 });
  const { parsed } = check(root);

  assert.equal(named(parsed, "corner claims measured").ok, false);
  assert.match(named(parsed, "corner claims measured").detail, /claims 0\.35 at topLeft/);
});

test("a uniform claim over genuinely uniform corners still passes", () => {
  const root = cornerCase("corner-uniform-ok", 0.2, {
    topLeft: 20,
    topRight: 20,
    bottomRight: 20,
    bottomLeft: 20,
  });
  const { status, parsed, out } = check(root);

  assert.equal(status, 0, out);
  assert.equal(named(parsed, "corner claims measured").ok, true);
});

test("the estimate the contract asks for is not tightened into a failure", () => {
  // "A corner that turns over roughly a tenth of the short side is 0.1" — the
  // release before this one celebrated a card claimed at 0.12 against a true
  // 0.09. That has to keep passing, or this check has replaced one wrong
  // answer with a demand nobody can meet by eye.
  const root = cornerCase("corner-estimate", 0.12, {
    topLeft: 9,
    topRight: 9,
    bottomRight: 9,
    bottomLeft: 9,
  });
  const { status, parsed, out } = check(root);

  assert.equal(status, 0, out);
  assert.equal(named(parsed, "corner claims measured").ok, true);
});

test("with no reference on disk the radius is reported unmeasured, not judged", () => {
  const { root } = workspace("corner-no-reference", {
    geometry: { ...GEOMETRY, shapeOwnership: [PANEL(0.4)] },
  });
  const { status, parsed, out } = check(root);

  assert.equal(status, 0, out);
  assert.match(named(parsed, "corner claims measured").detail, /no reference on disk/);
});

// ----------------------------------------------------- typography measured ---
//
// Three runs on one reference set their section headings in a serif against a
// grotesque, and every region came back CRITICAL. The barrier could not have
// caught any of them: the face lived in prose. These hold the two halves — the
// roles have to exist once there is something to measure against, and a claim
// to have measured has to be backed by a recording.

/** Strip the honest roles the minimum carries, to get back the old world. */
const NO_ROLES = (() => {
  const { typography, ...rest } = GEOMETRY;
  return rest;
})();

test("THE CASE: with a reference on disk, an analysis that names no face is held", () => {
  const { root, revision } = workspace("type-no-roles", { geometry: NO_ROLES, reference: "placeholder" });
  referenceFor(root, revision, { filled: false });
  const { status, parsed } = check(root);

  assert.equal(status, 1);
  assert.equal(named(parsed, "typography measured").ok, false);
  assert.match(named(parsed, "typography measured").detail, /typography\.roles is empty/);
});

test("prose about the type is not a face, and the barrier says which is missing", () => {
  const { root, revision } = workspace("type-prose", {
    geometry: {
      ...NO_ROLES,
      typography: { headings: "Dark teal serif headings", likelyFontFamily: "Poppins and a classic serif" },
    },
    reference: "placeholder",
  });
  referenceFor(root, revision, { filled: false });
  const { parsed } = check(root);

  assert.equal(named(parsed, "typography measured").ok, false);
});

test("a face claimed as measured with nothing recorded is held", () => {
  const { root, revision } = workspace("type-unbacked", {
    geometry: {
      ...NO_ROLES,
      typography: {
        roles: [
          { role: "headings", fontName: "LATO", source: "measured" },
          { role: "body", fontName: "LATO", source: "measured" },
        ],
      },
    },
    reference: "placeholder",
  });
  referenceFor(root, revision, { filled: false });
  const { parsed } = check(root);

  assert.equal(named(parsed, "typography measured").ok, false);
  assert.match(named(parsed, "typography measured").detail, /no match was recorded/);
});

test("a recorded match that backs the chosen face clears it", () => {
  const { root, revision } = workspace("type-backed", {
    geometry: {
      ...NO_ROLES,
      typography: {
        roles: [
          { role: "headings", fontName: "LATO", source: "measured" },
          { role: "body", fontName: "BARLOW", source: "measured" },
        ],
      },
    },
    reference: "placeholder",
  });
  referenceFor(root, revision, { filled: false });
  writeJson(path.join(revision, "typography-match.json"), {
    schemaVersion: 1,
    matches: [
      { role: "headings", text: "SUMMARY", ranked: [{ rank: 1, family: "LATO" }, { rank: 2, family: "BARLOW" }] },
      { role: "body", text: "body copy", ranked: [{ rank: 1, family: "BARLOW" }, { rank: 2, family: "LATO" }] },
    ],
  });
  const { status, parsed, out } = check(root);

  assert.equal(status, 0, out);
  assert.equal(named(parsed, "typography measured").ok, true);
  assert.match(named(parsed, "typography measured").detail, /2 measured/);
});

test("a recorded match that contradicts the chosen face is held, and names the winner", () => {
  const { root, revision } = workspace("type-contradicted", {
    geometry: {
      ...NO_ROLES,
      typography: {
        roles: [
          { role: "headings", fontName: "PT_SERIF", source: "measured" },
          { role: "body", fontName: "LATO", source: "assumed", why: "one family down from the heading face" },
        ],
      },
    },
    reference: "placeholder",
  });
  referenceFor(root, revision, { filled: false });
  writeJson(path.join(revision, "typography-match.json"), {
    schemaVersion: 1,
    matches: [
      {
        role: "headings",
        text: "SUMMARY",
        ranked: ["LATO", "BARLOW", "FIRA_SANS", "OPEN_SANS", "PT_SERIF"].map((family, i) => ({ rank: i + 1, family })),
      },
    ],
  });
  const { parsed } = check(root);

  assert.equal(named(parsed, "typography measured").ok, false);
  assert.match(named(parsed, "typography measured").detail, /ranked 5 of 5/);
  assert.match(named(parsed, "typography measured").detail, /behind LATO/);
});

test("a recording that does not parse is refused rather than read as no recording", () => {
  // It looks like evidence from the outside, which is the one way it could do
  // more damage than an absent file.
  const { root, revision } = workspace("type-corrupt", {
    geometry: {
      ...NO_ROLES,
      typography: { roles: [{ role: "headings", fontName: "LATO", source: "measured" }, { role: "body", fontName: "LATO", source: "measured" }] },
    },
    reference: "placeholder",
  });
  referenceFor(root, revision, { filled: false });
  fs.writeFileSync(path.join(revision, "typography-match.json"), "{ not json");
  const { parsed } = check(root);

  assert.equal(named(parsed, "typography measured").ok, false);
  assert.match(named(parsed, "typography measured").detail, /does not parse/);
});

test("with no reference there is nothing to match a face against, and none is demanded", () => {
  // The same gate `fillClaimsMeasured` uses, for the same reason: a face is
  // matched against a crop, so with no reference this would be asking for a
  // form rather than a fact.
  const { root } = workspace("type-no-reference", { geometry: NO_ROLES });
  const { status, parsed, out } = check(root);

  assert.equal(status, 0, out);
  assert.match(named(parsed, "typography measured").detail, /nothing to match a face against/);
});
