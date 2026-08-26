#!/usr/bin/env node
/**
 * scripts/render-and-diff.mjs — one loop pass, one command.
 *
 *   node scripts/render-and-diff.mjs --project <id> --revision <id> [--root <ws>]
 *        [--against reference|parent] [--skip-render] [--json]
 *
 * Every pass of the iteration loop runs the same deterministic chain: render,
 * scale the reference to the render's size, diff, check that the links in the
 * data are live in the PDF and that the document itself is whole, write the
 * evidence into the revision, ask whether the loop may continue. The serif
 * acceptance run paid for that as three to four separate model turns per pass —
 * and solved the scaling step itself, with ImageMagick shell arithmetic that
 * left junk files in the user's project root.
 *
 * The link and document checks are here rather than at approval time because
 * they are what the diff cannot see. An annotation has no pixels, so a document
 * whose every link is dead diffs identically to one where they all work; and a
 * page reading "Page 1 of 1" in a three-page document is forty grey pixels.
 *
 * This is that chain as one call. The agent's part of a pass — look at the
 * images, judge, decide the one cause to fix — is untouched; what is removed
 * is the taxi ride between the tools.
 *
 * The exit code is the loop's own verdict, so a skill can branch without
 * parsing anything:
 *
 *   0  READY_FOR_APPROVAL     stop and hand over to the user
 *   2  REVISE                 keep going; the JSON names the focus
 *   3  BLOCKED                stop and report the failure category
 *   1  a step failed          (compile error, missing image, …)
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  describeWorkspaceLine,
  installRoot,
  projectDir as workspaceProjectDir,
  resolveWorkspace,
} from "./lib/workspace.mjs";
import { pagePairs } from "./lib/page-pairs.mjs";

const repoRoot = installRoot();

function usage(code = 0) {
  process.stdout.write(
    "usage: node scripts/render-and-diff.mjs --project <id> --revision <id> [--root <workspace>]\n" +
      "                                        [--against reference|parent] [--skip-render] [--json]\n\n" +
      "  --project <id>        the project\n" +
      "  --revision <id>       the revision to render and judge\n" +
      "  --against <what>      what to diff the render against (default: reference;\n" +
      "                        parent diffs against the parent revision's output.png,\n" +
      "                        which is what refactor-only and data-only gates need)\n" +
      "  --skip-render         reuse the existing output.png (diff and verdict only)\n" +
      "  --root <workspace>    workspace override (default: discovered)\n" +
      "  --json                machine-readable result\n\n" +
      "exit: 0 ready for approval | 2 revise | 3 blocked | 1 a step failed\n",
  );
  process.exit(code);
}

function parseArgs(argv) {
  const out = { project: null, revision: null, root: null, against: "reference", skipRender: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--json") out.json = true;
    else if (a === "--skip-render") out.skipRender = true;
    else if (a === "--project" || a === "-p") out.project = argv[++i];
    else if (a === "--revision" || a === "-r") out.revision = argv[++i];
    else if (a === "--against") out.against = argv[++i];
    else if (a === "--root") out.root = argv[++i];
    else {
      process.stderr.write(`[render-and-diff] unknown argument: ${a}\n`);
      usage(2);
    }
  }
  if (!out.project || !out.revision) {
    process.stderr.write("[render-and-diff] --project and --revision are required\n");
    usage(2);
  }
  if (!["reference", "parent"].includes(out.against)) {
    process.stderr.write("[render-and-diff] --against must be reference or parent\n");
    usage(2);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const workspace = resolveWorkspace({ explicitRoot: args.root ?? null });
const banner = describeWorkspaceLine(workspace);
if (banner && !args.json) console.log(banner);

const projectDir = workspaceProjectDir(workspace, args.project);
const revisionDir = path.join(projectDir, "revisions", args.revision);

const result = {
  project: args.project,
  revision: args.revision,
  steps: [],
  diff: null,
  regions: null,
  loop: null,
};

/**
 * Page 1's image pair, kept so the region step measures the same two images
 * the page number came from rather than re-deriving them and risking a
 * different pair.
 */
let pagePair1 = null;

/**
 * The visual-analysis.json governing this revision.
 *
 * A `visual-change` revision writes its own. The narrow scopes — data-only,
 * asset-only, refactor-only — deliberately skip the analyser, so theirs is the
 * nearest ancestor's: the regions did not move, which is the entire premise of
 * those scopes. Walking up rather than giving up is what lets the region gate
 * apply to exactly the scopes config/pipeline.json assigns it to.
 */
function nearestVisualAnalysis(startDir) {
  let dir = startDir;
  const seen = new Set();
  while (dir && !seen.has(dir)) {
    seen.add(dir);
    const candidate = path.join(dir, "visual-analysis.json");
    if (fs.existsSync(candidate)) return candidate;
    const revision = (() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dir, "revision.json"), "utf8"));
      } catch {
        return null;
      }
    })();
    if (!revision?.parentRevisionId) return null;
    dir = path.join(projectDir, "revisions", revision.parentRevisionId);
  }
  return null;
}

/**
 * Which file the project itself calls page 1 of the reference.
 *
 * Older projects predate `import-reference` and name it something else; the
 * manifest is the only place that knows, so it is asked rather than assumed.
 */
function projectReferenceImage() {
  const file = path.join(projectDir, "template-project.json");
  if (!fs.existsSync(file)) return null;
  try {
    const declared = JSON.parse(fs.readFileSync(file, "utf8")).referenceImage;
    return declared ? path.join(projectDir, declared) : null;
  } catch {
    // A malformed manifest is reported by the tools that own it; here it just
    // means falling back to the canonical name.
    return null;
  }
}

/** The revision's overflow dataset, by name, or null. */
function overflowFixture() {
  if (!fs.existsSync(revisionDir)) return null;
  const found = fs.readdirSync(revisionDir).filter((f) => /-data\.overflow\.json$/.test(f));
  return found.length ? found[0] : null;
}

function step(name, fn) {
  const entry = { name, ok: false };
  result.steps.push(entry);
  try {
    fn(entry);
    entry.ok = true;
  } catch (cause) {
    entry.error = cause.message;
    finish(1);
  }
}

function run(command, runArgs) {
  const spawned = spawnSync(process.execPath, [command, ...runArgs], { encoding: "utf8" });
  return {
    status: spawned.status,
    stdout: spawned.stdout ?? "",
    output: `${spawned.stdout ?? ""}${spawned.stderr ?? ""}`,
  };
}

function finish(code) {
  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    for (const entry of result.steps) {
      console.log(`  ${entry.ok ? "ok  " : "FAIL"} ${entry.name}${entry.detail ? `  ${entry.detail}` : ""}`);
      if (entry.error) console.log(`       ${entry.error.split("\n").slice(0, 3).join("\n       ")}`);
    }
    if (result.diff) {
      console.log(
        `\n  diff: ${result.diff.mismatchPx} px (${result.diff.percent.toFixed(3)}%) — ${result.diff.classification}`,
      );
    }
    for (const d of result.document?.defects ?? []) {
      console.log(`  DOCUMENT DEFECT  ${d.id}: ${d.detail}`);
    }
    for (const n of result.document?.notes ?? []) {
      console.log(`  note             ${n}`);
    }
    for (const m of result.links?.missing ?? []) {
      console.log(`  MISSING LINK  ${m.at} = ${m.target}  (declared in the data, absent from the render)`);
    }
    for (const c of result.links?.undeclared ?? []) {
      console.log(`  warn          ${c.at} = ${c.value}  (link-shaped, no href recorded)`);
    }
    if (result.loop) {
      console.log(`  loop: ${result.loop.verdict}` + (result.loop.next ? ` — ${result.loop.next}` : ""));
    }
    console.log("");
  }
  process.exit(code);
}

// -------------------------------------------------------------------- steps ---

if (!args.skipRender) {
  step("render", (entry) => {
    const rendered = run(path.join(repoRoot, "scripts", "render.mjs"), [
      args.project,
      args.revision,
      "--root",
      workspace.root,
    ]);
    if (rendered.status !== 0) {
      // The tail, not the whole build log: a compile error's useful lines are
      // its last ones, and the agent reads this error inside one turn.
      const tail = rendered.output.trim().split("\n").slice(-15).join("\n");
      throw new Error(`render failed:\n${tail}`);
    }
    entry.detail = "output.pdf + output.png (clean + debug)";
  });

  step("overflow fixture", (entry) => {
    // A second dataset through the same template, when the revision carries
    // one. It is the only place a flowing document's page break, repeated
    // header and page numbering are ever rendered: the revision's own data
    // mirrors the reference, and a reference is a sample that fits.
    const fixture = overflowFixture();
    if (!fixture) {
      entry.detail = "none in this revision";
      return;
    }
    const rendered = run(path.join(repoRoot, "scripts", "render.mjs"), [
      args.project,
      args.revision,
      "--root",
      workspace.root,
      "--data-file",
      fixture,
      "--suffix",
      "-overflow",
    ]);
    if (rendered.status !== 0) {
      const tail = rendered.output.trim().split("\n").slice(-12).join("\n");
      throw new Error(`the overflow fixture did not render:\n${tail}`);
    }
    entry.detail = `${fixture} -> output-overflow.pdf`;
  });
} else {
  step("render (skipped)", (entry) => {
    if (!fs.existsSync(path.join(revisionDir, "output.png"))) {
      throw new Error("--skip-render was given but the revision has no output.png");
    }
    entry.detail = "reusing existing output.png";
  });
}

step("diff", (entry) => {
  let parentDir = null;
  if (args.against === "parent") {
    const revision = JSON.parse(fs.readFileSync(path.join(revisionDir, "revision.json"), "utf8"));
    if (!revision.parentRevisionId) {
      throw new Error("--against parent, but this revision has no parent");
    }
    parentDir = path.join(projectDir, "revisions", revision.parentRevisionId);
    if (!fs.existsSync(path.join(parentDir, "output.png"))) {
      throw new Error(`the parent revision has no output.png: ${parentDir}`);
    }
  }

  // Every page the source has, not only the first. A reference can be a
  // proposal or a book; comparing page 1 and stopping left the rest of the
  // document measured by nobody, while both sides had rasters on disk.
  const referenceDir = path.join(projectDir, "reference");
  const pages = pagePairs({
    referenceDir,
    referenceImage: projectReferenceImage(),
    revisionDir,
    parentDir,
    against: args.against,
  });

  if (!pages.pairs.length) {
    throw new Error(
      args.against === "parent"
        ? `the parent revision has no page to compare against: ${parentDir}`
        : `no reference image found under ${referenceDir}`,
    );
  }

  pagePair1 = pages.pairs.find((p) => p.page === 1) ?? null;

  const perPage = [];
  for (const pair of pages.pairs) {
    // ALWAYS the source image, never the scaled copy a previous pass left.
    //
    // Preferring the persisted copy switched off the aspect-mismatch warning
    // on every run after the first: `reference-scaled.png` already has the
    // render's exact dimensions, so `--scale-reference` finds nothing to
    // scale, skips the measurement, and rewrites visual-diff-stats.json
    // WITHOUT `aspectMismatch`. The distortion was still in the pixels being
    // compared — only the notice that it was there disappeared, on the second
    // render of the same revision. A backstop that turns itself off on retry
    // is worse than none, because the first run taught you to trust it.
    //
    // Costs nothing: the scaler is deterministic by design ("the same every
    // run, so diff numbers are comparable across passes"), so re-scaling
    // reproduces the identical file it would have reused.
    const source = pair.reference;

    const diffArgs = [source, pair.render, "--json", "--out", pair.diff];
    if (pair.page === 1) {
      // Page 1 alone writes the revision's diff artifacts. Everything
      // downstream reads those names, and having page 3 overwrite them would
      // make the recorded stats depend on page order.
      diffArgs.push("--update-revision", revisionDir);
    }
    if (args.against === "reference") {
      // Scaling is for the reference comparison only. A parent comparison is
      // same-renderer, same-size by construction — if the sizes differ there,
      // something real changed and the diff must fail loudly, not resample.
      diffArgs.push("--scale-reference", "--save-scaled", pair.scaled);
    }

    const diffed = run(path.join(repoRoot, "tools", "visual-diff", "bin", "visual-diff.mjs"), diffArgs);
    if (diffed.status !== 0) {
      throw new Error(diffed.output.trim() || `diff failed on page ${pair.page}`);
    }
    const stats = JSON.parse(diffed.stdout);
    perPage.push({
      page: pair.page,
      mismatchPx: stats.mismatchPx,
      percent: stats.percent,
      classification: stats.classification,
      parityScore: stats.parityScore,
      diffImage: stats.diff,
      // Present only when --scale-reference changed the reference's SHAPE and
      // not just its size. It travels with the numbers because it is a fact
      // about them: a stretched reference makes the mismatch look smaller than
      // it is, so a percentage carrying this field understates the difference
      // and cannot be classified until the page size is settled.
      ...(stats.aspectMismatch ? { aspectMismatch: stats.aspectMismatch } : {}),
    });
  }

  const first = perPage[0];
  // By share, not by raw pixel count. Pages are not obliged to be the same
  // size — a continuation page rendered at a different dpi has a different
  // denominator — and "worst" should mean the page furthest from its
  // reference, not the page with the most pixels in it.
  const worst = perPage.reduce((a, b) => (b.percent > a.percent ? b : a));
  result.diff = {
    against: args.against,
    // Page 1's numbers keep their place at the top level: every consumer of
    // this report already reads them there, and a multi-page document does not
    // change what page 1 scored.
    mismatchPx: first.mismatchPx,
    percent: first.percent,
    classification: first.classification,
    parityScore: first.parityScore,
    diffImage: first.diffImage,
    referencePages: pages.referencePages,
    renderPages: pages.renderPages,
    pages: perPage,
    worstPage: worst.page,
    missingFromRender: pages.missingFromRender,
    extraInRender: pages.extraInRender,
    // At the top level too, and as a list of pages rather than a boolean: a
    // reader who takes `percent` from here and stops must still be told that
    // the number was measured on a reference that had been stretched into a
    // shape it did not have. The page size is wrong, not the layout, and the
    // percentage is smaller than the truth. See docs/visual-accuracy-contract.md.
    ...(perPage.some((p) => p.aspectMismatch)
      ? {
          aspectMismatchPages: perPage
            .filter((p) => p.aspectMismatch)
            .map((p) => ({ page: p.page, ...p.aspectMismatch })),
        }
      : {}),
  };

  entry.detail =
    perPage.length === 1
      ? `${first.mismatchPx} px vs ${args.against} — ${first.classification}`
      : `${perPage.length} pages vs ${args.against} — worst is page ${worst.page} ` +
        `(${worst.mismatchPx} px, ${worst.classification})` +
        (pages.missingFromRender.length
          ? `; page(s) ${pages.missingFromRender.join(", ")} missing from the render`
          : "");
});

step("regions", (entry) => {
  // Where the difference lives, not just how much of it there is.
  //
  // A whole-page percentage against a rasterised design reference is never
  // zero and is dominated by glyph anti-aliasing, so the only thing a reviewer
  // can do with it is explain it — and an explanation that covers 9.7% covers
  // a structural defect hiding inside the same number. Regions disagree with
  // each other, which is what makes them checkable: even wear puts every
  // region's share of the diff near its share of the page, and a defect drives
  // one of them well above it.
  //
  // Evidence, not a gate: the ranking says where to look. `region-diff
  // --changed` is the gate, and it is what the data-only and asset-only scopes
  // are supposed to end on.
  const analysis = nearestVisualAnalysis(revisionDir);
  if (!analysis) {
    entry.detail = "no visual-analysis.json in this revision or its ancestors";
    return;
  }
  const page1 = (result.diff?.pages ?? []).length ? pagePair1 : null;
  if (!page1) {
    entry.detail = "no page 1 pair to measure";
    return;
  }

  const measured = run(
    path.join(repoRoot, "tools", "visual-diff", "bin", "region-diff.mjs"),
    [
      "--reference",
      // The scaled copy when the diff above made one: the regions must be cut
      // from the same pair of images the page number came from, or the shares
      // are computed against a denominator nobody else used.
      args.against === "reference" && fs.existsSync(page1.scaled) ? page1.scaled : page1.reference,
      "--output",
      page1.render,
      "--regions-file",
      analysis,
      "--write",
      revisionDir,
      "--json",
    ],
  );
  if (measured.status !== 0) {
    // Never fatal. A region measurement that cannot run is a missing view of
    // a comparison that already succeeded, and failing the pass here would
    // make a diagnostic into a blocker.
    entry.detail = `not measured: ${(measured.output || "").trim().split("\n")[0] || "failed"}`;
    return;
  }

  let regions;
  try {
    regions = JSON.parse(measured.stdout);
  } catch {
    entry.detail = "not measured: region-diff produced no JSON";
    return;
  }

  const ranked = regions.ranked
    .map((id) => regions.regions.find((r) => r.id === id))
    .filter((r) => r && r.mismatchPx > 0)
    // A region covering the whole page restates the page figure; it is true
    // and it is not a location, so it does not belong at the top of a list
    // whose whole purpose is to point somewhere.
    .filter((r) => r.shareOfPageArea < 90);

  result.regions = {
    analysis: path.relative(revisionDir, analysis) || path.basename(analysis),
    source: `${regions.width}x${regions.height}`,
    pageMismatchPx: regions.pageMismatchPx,
    stats: "region-diff-stats.json",
    ranked: ranked.map((r) => ({
      id: r.id,
      role: r.role ?? null,
      mismatchPx: r.mismatchPx,
      percentOfRegion: Number(r.percent.toFixed(2)),
      shareOfPageMismatch: Number(r.shareOfPageMismatch.toFixed(1)),
      shareOfPageArea: Number(r.shareOfPageArea.toFixed(1)),
      concentration: r.concentration === null ? null : Number(r.concentration.toFixed(2)),
    })),
  };

  const worst = ranked[0];
  entry.detail = worst
    ? `${ranked.length} regions measured — worst is ${worst.id} at ` +
      `${worst.concentration.toFixed(2)}x its share of the page ` +
      `(${worst.mismatchPx} px, ${worst.percent.toFixed(2)}% of the region)`
    : `${regions.regions.length} regions measured — none carries a difference`;
});

step("links", (entry) => {
  // The one defect the diff above is structurally blind to: a link annotation
  // has no pixels, so a dead link scores exactly zero mismatch. Cheap enough to
  // run every pass, and it never fails the pass on its own — what it finds is
  // folded into the verdict below.
  const checked = run(path.join(repoRoot, "scripts", "check-links.mjs"), [
    "--project",
    args.project,
    "--revision",
    args.revision,
    "--root",
    workspace.root,
    "--json",
  ]);
  let links;
  try {
    links = JSON.parse(checked.stdout);
  } catch {
    entry.detail = "not checked";
    return;
  }
  result.links = {
    checked: links.checked,
    skipped: links.skipped,
    rendered: links.rendered.linkAnnotations,
    declared: links.declaredCount ?? 0,
    missing: links.missing,
    undeclared: links.undeclared,
  };
  entry.detail = links.checked
    ? `${links.rendered.linkAnnotations} in the render, ${links.declaredCount} declared` +
      (links.missing.length ? ` — ${links.missing.length} MISSING` : "") +
      (links.undeclared.length ? `, ${links.undeclared.length} link-shaped without an href` : "")
    : `not checked — ${links.skipped}`;
});

step("document integrity", (entry) => {
  // The other blind spot: page count, "Page N of M" and whether pagination ran
  // at all are functional properties of a multi-page document, and each of them
  // scores as a few dozen grey pixels in a diff — or as nothing, when the
  // reference never had the page that went missing.
  const checked = run(path.join(repoRoot, "scripts", "check-document-integrity.mjs"), [
    "--project",
    args.project,
    "--revision",
    args.revision,
    "--root",
    workspace.root,
    "--json",
  ]);
  let integrity;
  try {
    integrity = JSON.parse(checked.stdout);
  } catch {
    entry.detail = "not checked";
    return;
  }
  result.document = {
    checked: integrity.checked,
    skipped: integrity.skipped,
    pageCount: integrity.pageCount,
    flow: integrity.flow?.kind ?? null,
    defects: integrity.defects,
    notes: integrity.notes,
  };
  entry.detail = integrity.checked
    ? `${integrity.pageCount} page(s)` +
      (integrity.flow ? `, ${integrity.flow.kind}` : "") +
      (integrity.defects.length ? ` — ${integrity.defects.length} DEFECT(S)` : "")
    : `not checked — ${integrity.skipped}`;
});

step("region roles", (entry) => {
  // The third blind spot, and the earliest one. A header drawn as body content
  // appears on page one and nowhere else; a footer drawn with bleedToEdge
  // floods the page; a table drawn as rows of shapes cannot break across one. On
  // page one of a sample document each of those looks exactly right, which is
  // why the diff above cannot see any of them.
  const checked = run(path.join(repoRoot, "scripts", "check-region-primitives.mjs"), [
    "--project",
    args.project,
    "--revision",
    args.revision,
    "--root",
    workspace.root,
    "--json",
  ]);
  let roles;
  try {
    roles = JSON.parse(checked.stdout);
  } catch {
    // No analysis or no plan yet is the ordinary state early in a loop.
    entry.detail = "not checked";
    return;
  }
  result.roles = {
    regions: roles.regions,
    mapped: roles.mapped,
    findings: roles.findings,
  };
  const contract = roles.findings.filter((f) => f.kind !== "role-missing");
  const unroled = roles.findings.filter((f) => f.kind === "role-missing");
  entry.detail =
    `${roles.regions} region(s)` +
    (contract.length ? ` — ${contract.length} built against their role` : "") +
    (unroled.length ? `, ${unroled.length} state no role` : "") +
    (!contract.length && !unroled.length ? " — each built the way its role says" : "");
});

step("structural smells", (entry) => {
  // The fourth blind spot, and the only one that is invisible even to a perfect
  // render. Three siblings each carrying the same margin look exactly like one
  // parent carrying the equivalent spacing — the diff is zero — but the first
  // is three numbers the next revision has to find and move together.
  const checked = run(path.join(repoRoot, "scripts", "check-structural-smells.mjs"), [
    "--project",
    args.project,
    "--revision",
    args.revision,
    "--root",
    workspace.root,
    "--json",
  ]);
  let smells;
  try {
    smells = JSON.parse(checked.stdout);
  } catch {
    // No generated template yet is the ordinary state early in a loop.
    entry.detail = "not checked";
    return;
  }
  result.structure = { template: smells.template, findings: smells.findings };
  const byKind = new Map();
  for (const f of smells.findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
  entry.detail = smells.findings.length
    ? [...byKind].map(([kind, n]) => `${n} ${kind}`).join(", ")
    : "geometry sits where it is owned";
});

step("loop verdict", (entry) => {
  const status = run(path.join(repoRoot, "scripts", "iterate-status.mjs"), [
    args.project,
    "--revision",
    args.revision,
    "--root",
    workspace.root,
    "--json",
  ]);
  // iterate-status exits 0/2/3 by verdict; anything it printed as JSON is the
  // answer regardless of which of those it chose.
  let loop;
  try {
    loop = JSON.parse(status.stdout);
  } catch {
    throw new Error(status.output.trim() || "iterate-status failed");
  }
  result.loop = {
    verdict: loop.verdict,
    focus: loop.largestMismatch,
    focusSource: loop.focusSource,
    rootCause: loop.rootCause,
    iterations: loop.iterations,
    remaining: loop.remaining,
    failureCategory: loop.failureCategory,
    next:
      loop.verdict === "REVISE"
        ? `fix "${loop.largestMismatch ?? "the largest mismatch"}"` +
          (loop.focusSource === "human" ? " (reported by the user)" : "")
        : loop.verdict === "BLOCKED"
          ? `stop: ${loop.failureCategory}`
          : "report to the user and wait",
  };
  entry.detail = loop.verdict;
});

// A declared href that never reached the PDF outranks a clean visual verdict.
// The render matched the reference because the difference is invisible — that
// is the argument for the downgrade, not against it. Only READY is downgraded:
// an already-REVISE pass keeps the focus the reviewer chose, and BLOCKED stays
// blocked.
// A document defect outranks a clean visual verdict for the same reason a dead
// link does: it is invisible in the comparison the verdict was formed from. A
// page reading "Page 1 of 1" in a three-page document is forty grey pixels.
if (result.document?.defects?.length && result.loop?.verdict === "READY_FOR_APPROVAL") {
  const first = result.document.defects[0];
  result.loop.verdict = "REVISE";
  result.loop.focus = first.id;
  result.loop.focusSource = "document-integrity";
  result.loop.next = `fix ${first.id}: ${first.detail}`;
}

// The verdict is formed from page 1, because that is the diff every downstream
// tool reads. On a one-page document that is the whole document and nothing
// here fires. On a proposal or a book it is the cover: a continuation page can
// be wrong in every way page 1 is right, and the pass would have called it
// ready without ever having looked.
if (result.loop?.verdict === "READY_FOR_APPROVAL") {
  const missing = result.diff?.missingFromRender ?? [];
  const bad = (result.diff?.pages ?? []).filter(
    (p) => p.page > 1 && (p.classification === "MAJOR" || p.classification === "CRITICAL"),
  );

  if (missing.length) {
    result.loop.verdict = "REVISE";
    result.loop.focus = "missing-pages";
    result.loop.focusSource = "page-parity";
    // The two comparisons fail for different reasons and take different fixes.
    // Against the reference, a short render is usually a manifest that was
    // never told how long the document is. Against the parent, the manifest is
    // not involved at all: the previous revision produced that page and this
    // one does not, which is the regression the parent gate exists to catch.
    // Naming `render.pages` there would send the reader to the wrong file.
    result.loop.next =
      args.against === "parent"
        ? `the parent revision has ${result.diff.referencePages} page(s) and this one produced ` +
          `${result.diff.renderPages}: page(s) ${missing.join(", ")} disappeared. ` +
          `A refactor does not lose a page — find what stopped emitting it`
        : `the reference has ${result.diff.referencePages} page(s) and the render produced ` +
          `${result.diff.renderPages}: page(s) ${missing.join(", ")} were never compared. ` +
          `Set render.pages in template-project.json to ${result.diff.referencePages} and render again`;
  } else if (bad.length) {
    const worst = bad.reduce((a, b) => (b.percent > a.percent ? b : a));
    result.loop.verdict = "REVISE";
    result.loop.focus = `page-${worst.page}`;
    result.loop.focusSource = "page-parity";
    result.loop.next =
      `page 1 matches, page ${worst.page} does not: ${worst.mismatchPx} px ` +
      `(${worst.classification}). Compare diff-page-${worst.page}.png against ` +
      `reference-scaled-page-${worst.page}.png`;
  }
}

// A region built against its role is a defect the comparison cannot reach. The
// document that prompted this names a header "Repeats on both pages unchanged"
// and builds it as body content, so page two loses it — and page one, which is
// what the diff compares, is perfect.
if (result.roles?.findings?.length && result.loop?.verdict === "READY_FOR_APPROVAL") {
  const contract = result.roles.findings.filter((f) => f.kind !== "role-missing");
  const first = contract[0] ?? result.roles.findings[0];
  result.loop.verdict = "REVISE";
  result.loop.focus = first.region;
  result.loop.focusSource = "region-role";
  result.loop.next = `${first.kind} in ${first.region}: ${first.detail}`;
}

if (result.links?.missing?.length && result.loop?.verdict === "READY_FOR_APPROVAL") {
  const targets = result.links.missing.map((m) => m.target).join(", ");
  result.loop.verdict = "REVISE";
  result.loop.focus = "dead-links";
  result.loop.focusSource = "link-integrity";
  result.loop.next =
    `wire ${result.links.missing.length} declared link(s) into the render: ${targets}` +
    ` — the data has the href, the PDF has no such target`;
}

const EXIT = { READY_FOR_APPROVAL: 0, REVISE: 2, BLOCKED: 3 };
finish(EXIT[result.loop?.verdict] ?? 1);
