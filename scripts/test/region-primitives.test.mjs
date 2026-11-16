#!/usr/bin/env node
/**
 * scripts/test/region-primitives.test.mjs — a region's role decides how it may be built.
 *
 * The failure this exists to prevent, taken from a real proposal run: the
 * analysis names a region `page-footer`, labels it "Footer band", and the
 * template builds it with
 *
 *     page.addSection("Footer", footer -> footer.fillColor(INK)
 *             .bleedToEdge(DocumentEdge.LEFT, DocumentEdge.RIGHT, DocumentEdge.BOTTOM))
 *
 * instead of `session.footer(DocumentHeaderFooter.builder()...)`. Bleeding
 * extends a fill past the margin to the paper edge, which is the opposite of the
 * band a footer occupies, and a footer drawn as body content appears on page one
 * and nowhere else.
 *
 * Both are invisible where the harness looks hardest: page one of a one-page
 * sample renders exactly right. The same run's header carries a note reading
 * "Repeats on both pages unchanged" and is built as body content too.
 *
 * Every signature the contract names was verified against the 2.2 allow-list;
 * a test that pinned an invented method would be worse than no test.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  PAGE_ZONE_SINCE,
  ROLE_CONTRACT,
  checkRegionPrimitives,
  chromeInstead,
  chromeRegistrations,
  methodBody,
} from "../lib/region-primitives.mjs";
import { checkPaginationPlan } from "../lib/pagination-plan.mjs";
import { packSymbols } from "../lib/pack-surface.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "check-region-primitives.mjs");

const check = (source, regions, componentMapping) =>
  checkRegionPrimitives({ regions, componentMapping, source });

const kinds = (findings) => findings.map((f) => f.kind).sort();

// --- the defect that prompted this --------------------------------------------

const BLED_FOOTER = `public final class T {
    private void renderFooter(PageFlowBuilder page, Spec spec, int pageNumber) {
        page.addSection("Footer", footer -> {
            footer.spacing(0)
                    .fillColor(INK)
                    .bleedToEdge(DocumentEdge.LEFT, DocumentEdge.RIGHT, DocumentEdge.BOTTOM)
                    .padding(0f, 0f, 0f, 0f);
        });
    }
}`;

const CHROME_FOOTER = `public final class T {
    private void renderFooter(DocumentSession document, Spec spec) {
        document.footer(DocumentHeaderFooter.builder()
                .zone(DocumentHeaderFooterZone.FOOTER)
                .centerText("Page {page} of {pages}")
                .build());
    }
}`;

const FOOTER_REGION = [{ id: "page-footer", label: "Footer band", role: "page-footer" }];
const FOOTER_MAPPING = [{ region: "page-footer", renderMethod: "renderFooter" }];

test("a footer built by bleeding to the page edge is named, and the fix is named with it", () => {
  const findings = check(BLED_FOOTER, FOOTER_REGION, FOOTER_MAPPING);
  assert.deepEqual(kinds(findings), ["forbidden-primitive", "missing-primitive"]);
  assert.match(findings[0].detail, /bleedToEdge/);
  assert.match(findings[0].detail, /DocumentSession\.footer\(DocumentHeaderFooter\)/);
  assert.match(findings[0].detail, /page one only/, "the consequence is not stated");
});

test("a footer built as chrome passes", () => {
  assert.deepEqual(check(CHROME_FOOTER, FOOTER_REGION, FOOTER_MAPPING), []);
});

test("a header drawn as body content is caught the same way", () => {
  // The same run's analysis says of its header: "Repeats on both pages
  // unchanged". It is built inside page.addSection, so page two loses it — and
  // page one, which is what the diff compares, is perfect.
  const source = `public final class T {
    private void renderHeader(PageFlowBuilder page, Spec spec) {
        page.addSection("Header", header -> header.addRow("HeaderRow", row -> row.gap(4)));
    }
}`;
  const findings = check(
    source,
    [{ id: "page-header", label: "Brand header", role: "page-header" }],
    [{ region: "page-header", renderMethod: "renderHeader" }],
  );
  assert.deepEqual(kinds(findings), ["missing-primitive"]);
  assert.match(findings[0].detail, /DocumentSession\.header/);
});

// --- two mechanisms: text slots and node zones --------------------------------
//
// The check used to accept a footer only if its body contained "footer(" or
// "DocumentHeaderFooter". A footer built as a DocumentPageZone — GraphCompose
// 2.3+, the only way to put a logo, a link or a layout in the band — was
// reported as missing, and the fix it printed told the agent to downgrade the
// band to three strings. The same substrings could not tell the zones apart:
// "DocumentHeaderFooter" is in a header and a footer alike.
//
// Every call below was checked with api-query against the 2.5 pack:
// SessionChromeApi.zone(DocumentPageZone), DocumentPageZone.footer/header(double,
// Function<PageContext, DocumentNode>), PageContext.pageNumber(DocumentTextStyle),
// DocumentPageZone.toBuilder()/appliesTo(Predicate<PageContext>).

const TEXT_FOOTER = `public final class T {
    private void renderFooter(DocumentSession document, Spec spec) {
        document.footer(DocumentHeaderFooter.builder()
                .leftText(spec.company())
                .rightText("Page {page} of {pages}")
                .build());
    }
}`;

const RICH_FOOTER = `public final class T {
    private void renderFooter(DocumentSession document, Spec spec) {
        // logo, notice and the page number, laid out as a row
        document.chrome().zone(DocumentPageZone.footer(34, page -> new RowBuilder()
                .name("FooterZone")
                .gap(8)
                .add(new ImageBuilder().source(spec.logo()).size(18, 18).build())
                .addParagraph(p -> p.text(spec.notice()).textStyle(Theme.CHROME))
                .flexSpacer()
                .add(page.pageNumber(Theme.CHROME))
                .build()));
    }
}`;

const RICH_HEADER = `public final class T {
    private void renderRunningHead(DocumentSession session, Spec spec) {
        session.chrome().zone(DocumentPageZone.header(24, page -> new RowBuilder()
                        .name("HeaderZone")
                        .addParagraph(p -> p.text(spec.title()).textStyle(Theme.CHROME))
                        .flexSpacer()
                        .addParagraph(p -> p.textStyle(Theme.CHROME).inlineLink(spec.site(), spec.siteLink()))
                        .build())
                .toBuilder()
                .appliesTo(page -> !page.isFirst())
                .build());
    }
}`;

const HEADER_REGION = [{ id: "running-head", label: "Running head", role: "page-header" }];
const HEADER_MAPPING = [{ region: "running-head", renderMethod: "renderRunningHead" }];

test("a simple text footer built with DocumentHeaderFooter passes", () => {
  assert.deepEqual(check(TEXT_FOOTER, FOOTER_REGION, FOOTER_MAPPING), []);
  assert.deepEqual(
    check(TEXT_FOOTER, [{ ...FOOTER_REGION[0], chrome: { mechanism: "header-footer" } }], FOOTER_MAPPING),
    [],
  );
});

test("a rich footer with a logo, a layout and numbering built as a DocumentPageZone passes", () => {
  assert.deepEqual(check(RICH_FOOTER, FOOTER_REGION, FOOTER_MAPPING), []);
  assert.deepEqual(
    checkRegionPrimitives({
      regions: [{ ...FOOTER_REGION[0], chrome: { mechanism: "page-zone", reason: "logo beside the number" } }],
      componentMapping: FOOTER_MAPPING,
      source: RICH_FOOTER,
      pageZones: true,
      graphComposeLine: "2.5",
    }),
    [],
  );
});

test("a rich header built as a DocumentPageZone passes, appliesTo and all", () => {
  assert.deepEqual(check(RICH_HEADER, HEADER_REGION, HEADER_MAPPING), []);
});

test("a zone built by a builder or by a helper is read through", () => {
  const source = `public final class T {
    private void renderFooter(DocumentSession document, Spec spec) {
        document.chrome().zone(footerZone(spec));
    }
    private DocumentPageZone footerZone(Spec spec) {
        return DocumentPageZone.builder()
                .zone(DocumentHeaderFooterZone.FOOTER)
                .height(30)
                .content(page -> new RowBuilder().add(page.pageNumber()).build())
                .build();
    }
}`;
  assert.deepEqual(check(source, FOOTER_REGION, FOOTER_MAPPING), []);
  assert.deepEqual(chromeRegistrations(methodBody(source, "renderFooter"), source), [
    { mechanism: "page-zone", zone: "footer" },
  ]);
});

test("a footer rendered only as body content is caught, with both mechanisms named", () => {
  // No bleed, nothing forbidden — a perfectly plain row at the end of the flow,
  // which is exactly right on page one and absent from every page after it.
  const source = `public final class T {
    private void renderFooter(PageFlowBuilder page, Spec spec) {
        page.addRow("Footer", row -> row
                .addParagraph(p -> p.text(spec.company()))
                .addParagraph(p -> p.text("Page 1 of 1")));
    }
}`;
  const findings = check(source, FOOTER_REGION, FOOTER_MAPPING);
  assert.deepEqual(kinds(findings), ["missing-primitive"]);
  assert.match(findings[0].detail, /page one only/);
  assert.match(findings[0].detail, /DocumentSession\.footer\(DocumentHeaderFooter\)/);
  assert.match(findings[0].detail, /chrome\(\)\.zone\(DocumentPageZone\.footer/);
});

test("a header and a footer are not confused for each other", () => {
  // The old substring check passed both of these: "DocumentHeaderFooter" is in
  // either zone, and "header(" is in a table's header row.
  const footerFromHeaderRegion = `public final class T {
    private void renderRunningHead(DocumentSession session, Spec spec) {
        session.footer(DocumentHeaderFooter.builder()
                .zone(DocumentHeaderFooterZone.HEADER)
                .centerText(spec.title())
                .build());
    }
}`;
  const wrong = check(footerFromHeaderRegion, HEADER_REGION, HEADER_MAPPING);
  assert.deepEqual(kinds(wrong), ["wrong-zone"], "the call decides the zone, not the builder");
  assert.match(wrong[0].detail, /registers a page footer/);

  const zoneFromFooterRegion = check(RICH_HEADER.replace("renderRunningHead", "renderFooter"), FOOTER_REGION, FOOTER_MAPPING);
  assert.deepEqual(kinds(zoneFromFooterRegion), ["wrong-zone"]);

  const tableHeader = `public final class T {
    private void renderRunningHead(PageFlowBuilder page, Spec spec) {
        page.addTable(t -> t.header("Item", "Qty")); // not DocumentHeaderFooter
        renderFooter(page, spec);
        page.addParagraph(p -> p.text("session.header(DocumentHeaderFooter)"));
    }
}`;
  assert.deepEqual(kinds(check(tableHeader, HEADER_REGION, HEADER_MAPPING)), ["missing-primitive"]);
});

test("pre-2.3 lines have no DocumentPageZone: the zone is reported, and the fix names text slots only", () => {
  const onOld = checkRegionPrimitives({
    regions: FOOTER_REGION,
    componentMapping: FOOTER_MAPPING,
    source: RICH_FOOTER,
    pageZones: false,
    graphComposeLine: "2.2",
  });
  assert.deepEqual(kinds(onOld), ["missing-primitive", "primitive-unavailable"]);
  const unavailable = onOld.find((f) => f.kind === "primitive-unavailable");
  assert.match(unavailable.detail, /GraphCompose 2\.2 does not have/);
  assert.match(unavailable.detail, /2\.3/);
  const missing = onOld.find((f) => f.kind === "missing-primitive");
  assert.doesNotMatch(missing.detail, /chrome\(\)\.zone/, "advice for a line that cannot compile it");

  // The text footer is the same build on every line.
  assert.deepEqual(
    checkRegionPrimitives({ regions: FOOTER_REGION, componentMapping: FOOTER_MAPPING, source: TEXT_FOOTER, pageZones: false }),
    [],
  );
  // An analysis that chose a zone on such a line is told so, not sent to build one.
  const chosen = checkRegionPrimitives({
    regions: [{ ...FOOTER_REGION[0], chrome: { mechanism: "page-zone" } }],
    componentMapping: FOOTER_MAPPING,
    source: TEXT_FOOTER,
    pageZones: false,
    graphComposeLine: "2.2",
  });
  assert.deepEqual(kinds(chosen), ["primitive-unavailable"]);
});

test("2.3+ lines accept the zone and name it in the fix", () => {
  for (const line of ["2.3", "2.4", "2.5"]) {
    assert.deepEqual(
      checkRegionPrimitives({ regions: FOOTER_REGION, componentMapping: FOOTER_MAPPING, source: RICH_FOOTER, pageZones: true, graphComposeLine: line }),
      [],
      line,
    );
  }
  assert.match(chromeInstead("footer", true), /DocumentPageZone\.footer/);
  assert.doesNotMatch(chromeInstead("footer", false), /DocumentPageZone\.footer\(/);
});

test("the version boundary is the packs' own answer, not a number written here", () => {
  // If a pack ever disagreed with PAGE_ZONE_SINCE, the CLI — which asks the pack
  // — and the advice text — which states the number — would part ways.
  const versions = path.join(repoRoot, "skills", "versions");
  const has = (line) => packSymbols(path.join(versions, `graphcompose-${line}`))?.has("DocumentPageZone");
  assert.equal(has("2.2"), false, "2.2 predates DocumentPageZone");
  for (const line of ["2.3", "2.4", "2.5"]) {
    if (!fs.existsSync(path.join(versions, `graphcompose-${line}`))) continue;
    assert.equal(has(line), true, `${line} should have DocumentPageZone`);
  }
  assert.equal(PAGE_ZONE_SINCE, "2.3");
});

test("a chosen mechanism the template did not use is reported", () => {
  const findings = check(
    TEXT_FOOTER,
    [{ ...FOOTER_REGION[0], chrome: { mechanism: "page-zone", reason: "the logo sits beside the page number" } }],
    FOOTER_MAPPING,
  );
  assert.deepEqual(kinds(findings), ["mechanism-mismatch"]);
  assert.match(findings[0].detail, /Text slots cannot carry a logo/);
});

// --- the other roles ----------------------------------------------------------

test("a table built as rows of shapes is not a table", () => {
  const source = `public final class T {
    private void renderTimeline(PageFlowBuilder page) {
        page.addRow("r1", row -> row.addRectangle(r -> r.height(12)));
    }
}`;
  const findings = check(
    source,
    [{ id: "timeline", label: "Timeline", role: "table" }],
    [{ region: "timeline", renderMethod: "renderTimeline" }],
  );
  assert.deepEqual(kinds(findings), ["missing-primitive"]);
  assert.match(findings[0].detail, /addTable/);
});

test("a table built with addTable passes", () => {
  const source = `public final class T {
    private void renderTimeline(PageFlowBuilder page) {
        page.addTable(t -> t.repeatHeader());
    }
}`;
  assert.deepEqual(
    check(
      source,
      [{ id: "timeline", label: "Timeline", role: "table" }],
      [{ region: "timeline", renderMethod: "renderTimeline" }],
    ),
    [],
  );
});

test("an icon and an image must be the thing, not a shape the size of it", () => {
  const source = `public final class T {
    private void renderBadge(PageFlowBuilder page) {
        page.addCircle(c -> c.diameter(24).fillColor(TEAL));
    }
    private void renderPhoto(PageFlowBuilder page) {
        page.addRectangle(r -> r.width(100).height(120));
    }
}`;
  const findings = check(
    source,
    [
      { id: "badge", label: "Section badge", role: "icon" },
      { id: "photo", label: "Portrait", role: "image" },
    ],
    [
      { region: "badge", renderMethod: "renderBadge" },
      { region: "photo", renderMethod: "renderPhoto" },
    ],
  );
  assert.deepEqual(kinds(findings), ["missing-primitive", "missing-primitive"]);
  assert.match(findings.find((f) => f.region === "badge").detail, /addSvgIcon/);
  assert.match(findings.find((f) => f.region === "photo").detail, /addImage/);
});

test("roles with no build contract are left alone, deliberately", () => {
  const source = `public final class T {
    private void renderTerms(PageFlowBuilder page) { page.addParagraph(p -> p.text("x")); }
}`;
  for (const role of ["content", "background", "panel", "divider"]) {
    assert.deepEqual(
      check(
        source,
        [{ id: "terms", label: "Terms", role }],
        [{ region: "terms", renderMethod: "renderTerms" }],
      ),
      [],
      `${role} grew a contract nobody wrote`,
    );
  }
});

// --- the holes in the contract ------------------------------------------------

test("a region with no role is a hole in the contract, not a pass", () => {
  // The run that prompted this had fourteen regions and set a role on none —
  // including the one it had named `page-footer`.
  const findings = check(
    CHROME_FOOTER,
    [{ id: "page-footer", label: "Footer band" }],
    FOOTER_MAPPING,
  );
  assert.deepEqual(kinds(findings), ["role-missing"]);
  assert.match(findings[0].detail, /was never decided/);
});

test("a role with a contract and no render method to check is reported", () => {
  assert.deepEqual(kinds(check(CHROME_FOOTER, FOOTER_REGION, [])), ["region-not-mapped"]);
});

test("a plan naming a method the template does not define is reported", () => {
  const findings = check(CHROME_FOOTER, FOOTER_REGION, [
    { region: "page-footer", renderMethod: "renderPageFooter" },
  ]);
  assert.deepEqual(kinds(findings), ["method-not-found"]);
});

test("a method that is not there is reported whatever the region is for", () => {
  // luma's `parties` is role `content`, which carries no build contract, so the
  // check returned before ever asking whether `renderParties()` existed. It did
  // not — the source has always said `renderParty(…)` — and six revisions later
  // that was the reason the published bundle had no structure. Whether a method
  // exists is not a question about the role.
  const source = `public final class T {
    private void renderParty(SectionBuilder section) { section.addParagraph(p -> p.text("x")); }
}`;
  const findings = check(
    source,
    [{ id: "parties", label: "Bill to / ship to", role: "content" }],
    [{ region: "parties", renderMethod: "renderParties" }],
  );

  assert.deepEqual(kinds(findings), ["method-not-found"]);
  assert.equal(findings[0].role, "content");
  assert.equal(findings[0].method, "renderParties");
});

test("a drifted mapping is reported once, not once per pass", () => {
  const findings = check(CHROME_FOOTER, FOOTER_REGION, [
    { region: "page-footer", renderMethod: "renderPageFooter" },
    { region: "page-footer", renderMethod: "renderPageFooter" },
  ]);
  assert.deepEqual(kinds(findings), ["method-not-found"]);
});

// --- reading a method out of Java ---------------------------------------------

test("a method body is read by matching braces, not by guessing where it ends", () => {
  // GraphCompose templates are built from nested lambdas; a regex that stopped
  // at the first closing brace would read three lines of a thirty-line method
  // and pass everything below it.
  const source = `class T {
    private void a() {
        x(y -> { z(w -> { deep(); }); });
        marker();
    }
    private void b() { other(); }
}`;
  const body = methodBody(source, "a");
  assert.ok(body.includes("marker()"), "the body stopped at the first nested brace");
  assert.ok(!body.includes("other()"), "the body ran past its own closing brace");
  assert.equal(methodBody(source, "missing"), null);
});

test("a call to a method is not mistaken for its declaration", () => {
  const source = `class T {
    private void caller() { renderFooter(page, spec); }
    private void renderFooter(PageFlowBuilder page, Spec spec) { document.footer(x); }
}`;
  assert.match(methodBody(source, "renderFooter"), /document\.footer/);
});

test("every contract names calls, and every role it constrains is in the schema enum", () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "schemas", "visual-analysis.schema.json"), "utf8"),
  );
  const allowed = schema.properties.regions.items.properties.role.enum;
  for (const [role, contract] of Object.entries(ROLE_CONTRACT)) {
    assert.ok(allowed.includes(role), `the contract constrains "${role}", which the schema rejects`);
    assert.ok(contract.because.length > 20, `${role} states no reason`);
    assert.ok(contract.instead.length > 5, `${role} does not say what to use instead`);
  }
  assert.ok(
    schema.properties.regions.items.required.includes("role"),
    "role is optional again — the run that prompted this set it on none of fourteen regions",
  );
});

// --- the CLI ------------------------------------------------------------------

function scenario(label, { analysis, plan, java }) {
  const host = fs.mkdtempSync(path.join(os.tmpdir(), `gcrp-${label}-`));
  process.on("exit", () => {
    try {
      fs.rmSync(host, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });
  const root = path.join(host, "graphcompose-flow");
  const revision = path.join(root, "projects", "demo", "revisions", "revision-001");
  fs.mkdirSync(revision, { recursive: true });
  fs.writeFileSync(path.join(root, "flow.config.json"), JSON.stringify({ schemaVersion: 1 }));
  fs.writeFileSync(
    path.join(root, "projects", "demo", "template-project.json"),
    JSON.stringify({ projectName: "demo", schemaVersion: 1 }),
  );
  if (analysis) fs.writeFileSync(path.join(revision, "visual-analysis.json"), JSON.stringify(analysis));
  if (plan) fs.writeFileSync(path.join(revision, "architecture-plan.json"), JSON.stringify(plan));
  if (java) fs.writeFileSync(path.join(revision, "GeneratedTemplate.java"), java);
  return { root, revision };
}

function runCli(root) {
  const spawned = spawnSync(
    process.execPath,
    [CLI, "--project", "demo", "--revision", "revision-001", "--root", root, "--json"],
    { encoding: "utf8" },
  );
  let parsed = null;
  try {
    parsed = JSON.parse(spawned.stdout);
  } catch {
    /* failure path */
  }
  return { status: spawned.status, parsed, output: `${spawned.stdout}${spawned.stderr}` };
}

test("the CLI reads the three artifacts and reports what disagrees", () => {
  const s = scenario("cli", {
    analysis: { schemaVersion: 1, page: {}, regions: FOOTER_REGION },
    plan: { schemaVersion: 1, componentMapping: FOOTER_MAPPING },
    java: BLED_FOOTER,
  });
  const { status, parsed } = runCli(s.root);

  assert.equal(status, 0, "findings are evidence for the loop, not a build failure");
  assert.deepEqual(kinds(parsed.findings), ["forbidden-primitive", "missing-primitive"]);
  assert.equal(parsed.regions, 1);
});

test("the CLI holds a zone-built footer to the workspace's resolved line", () => {
  const inputs = {
    analysis: { schemaVersion: 1, page: {}, regions: FOOTER_REGION },
    plan: { schemaVersion: 1, componentMapping: FOOTER_MAPPING },
    java: RICH_FOOTER,
  };

  const old = scenario("line22", inputs);
  fs.writeFileSync(path.join(old.root, "resolved-version.json"), JSON.stringify({ schemaVersion: 1, version: "2.2.2", line: "2.2" }));
  const onOld = runCli(old.root).parsed;
  assert.equal(onOld.graphComposeLine, "2.2");
  assert.equal(onOld.pageZones, false);
  assert.ok(onOld.findings.some((f) => f.kind === "primitive-unavailable"));

  const current = scenario("line25", inputs);
  fs.writeFileSync(path.join(current.root, "resolved-version.json"), JSON.stringify({ schemaVersion: 1, version: "2.5.0", line: "2.5" }));
  const onCurrent = runCli(current.root).parsed;
  assert.equal(onCurrent.pageZones, true);
  assert.deepEqual(onCurrent.findings, []);

  // Nothing resolved: neither mechanism is refused.
  const unknown = runCli(scenario("lineunknown", inputs).root).parsed;
  assert.equal(unknown.pageZones, null);
  assert.deepEqual(unknown.findings, []);
});

test("missing inputs are named refusals rather than an empty pass", () => {
  const noPlan = scenario("noplan", {
    analysis: { schemaVersion: 1, regions: FOOTER_REGION },
    java: BLED_FOOTER,
  });
  const { status, output } = runCli(noPlan.root);
  assert.equal(status, 3);
  assert.match(output, /architecture-plan\.json/);

  const noAnalysis = scenario("noanalysis", {
    plan: { schemaVersion: 1, componentMapping: FOOTER_MAPPING },
    java: BLED_FOOTER,
  });
  assert.equal(runCli(noAnalysis.root).status, 3);
});

test("usage errors are usage errors", () => {
  assert.equal(spawnSync(process.execPath, [CLI], { encoding: "utf8" }).status, 2);
});

// --- the page model ------------------------------------------------------------

const paginationKinds = (input) => checkPaginationPlan(input).map((f) => f.kind).sort();

test("a one-page document is asked nothing about its page model", () => {
  // There is no model to decide, and demanding a block would be noise on every
  // invoice and CV the harness builds.
  assert.deepEqual(checkPaginationPlan({ plan: {}, referencePages: 1, source: "" }), []);
});

test("a multi-page document with no page model decided is stopped before the layout is", () => {
  // A book's first page is not its second: different margins, no running
  // header, often no page number. pageMargins takes per-page rules precisely so
  // that can be stated rather than worked around.
  const findings = checkPaginationPlan({ plan: {}, referencePages: 3, source: "" });
  assert.deepEqual(findings.map((f) => f.kind), ["pagination-undecided"]);
  assert.match(findings[0].detail, /PageMarginRule\.page\(1/);
  assert.match(findings[0].detail, /first-page-different/);
});

test("first-page-different without saying what differs is not a decision", () => {
  const kinds = paginationKinds({
    plan: { pagination: { pageModel: "first-page-different", keepRules: [{ region: "a", rule: "keepTogether", why: "w" }] } },
    referencePages: 2,
    source: "keepTogether()",
  });
  assert.deepEqual(kinds, ["first-page-difference-unstated"]);
});

test("a flowing document that states no keep rules is told so", () => {
  // A heading orphaned above its content and a table header alone at the foot
  // of a page are both invisible in a render of the one-page sample.
  const kinds = paginationKinds({
    plan: { pagination: { pageModel: "uniform" } },
    referencePages: 2,
    source: "",
  });
  assert.deepEqual(kinds, ["keep-rules-unstated"]);
});

test("a keep rule the plan decided and the template never built is the worse case", () => {
  // Worse than an unwritten rule: the plan says the break is handled, so nobody
  // looks again.
  const findings = checkPaginationPlan({
    plan: {
      pagination: {
        pageModel: "uniform",
        keepRules: [{ region: "timeline", rule: "keepWithNext", why: "the heading must not orphan" }],
      },
    },
    referencePages: 2,
    source: "class T { void renderTimeline() { page.addTable(t -> t.repeatHeader()); } }",
    componentMapping: [{ region: "timeline", renderMethod: "renderTimeline" }],
  });
  assert.deepEqual(findings.map((f) => f.kind), ["keep-rule-not-built"]);
  assert.equal(findings[0].region, "timeline");
  assert.match(findings[0].detail, /renderTimeline\(\) owns that region/);
});

test("a keep rule the template built passes", () => {
  assert.deepEqual(
    checkPaginationPlan({
      plan: {
        pagination: {
          pageModel: "uniform",
          keepRules: [{ region: "timeline", rule: "keepWithNext", why: "w" }],
        },
      },
      referencePages: 2,
      source: "section.keepWithNext();",
    }),
    [],
  );
});

test("a declared page break the template never emits is reported", () => {
  const findings = checkPaginationPlan({
    plan: {
      pagination: {
        pageModel: "sectioned",
        keepRules: [{ region: "a", rule: "keepTogether", why: "w" }],
        breaks: [{ after: "cover", why: "the contents start a new page" }],
      },
    },
    referencePages: 4,
    source: "section.keepTogether();",
  });
  assert.deepEqual(findings.map((f) => f.kind), ["page-break-not-built"]);
  assert.match(findings[0].detail, /addPageBreak/);
});

test("a fully decided plan that the template implements says nothing", () => {
  assert.deepEqual(
    checkPaginationPlan({
      plan: {
        pagination: {
          pageModel: "first-page-different",
          firstPageDiffers: ["zero margins for a full-bleed cover", "no running header"],
          keepRules: [{ region: "chapter", rule: "keepWithNext", why: "a chapter heading must not orphan" }],
          breaks: [{ after: "cover", why: "the contents start a new page" }],
        },
      },
      referencePages: 6,
      source: "flow.addPageBreak(pb -> pb.name(\"afterCover\")); section.keepWithNext();",
    }),
    [],
  );
});

test("the schema accepts every page model and keep rule the checker knows", () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "schemas", "architecture-plan.schema.json"), "utf8"),
  );
  const pagination = schema.properties.pagination;
  assert.ok(pagination, "the plan has no pagination block to fill in");
  assert.deepEqual(pagination.properties.pageModel.enum, [
    "uniform",
    "first-page-different",
    "sectioned",
  ]);
  assert.deepEqual(
    pagination.properties.keepRules.items.properties.rule.enum.sort(),
    ["keepTogether", "keepWithNext"],
  );
});
