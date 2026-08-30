#!/usr/bin/env node
/**
 * scripts/test/bundle-split.test.mjs — where each member of a generated
 * template lands in the published bundle.
 *
 * The classification runs at publish, unattended, on whatever the loop happened
 * to produce. There is no reviewer between it and the bundle a person is handed,
 * so every rule it applies has to be pinned here — including the ones that say
 * "do not try", because a splitter that guesses at an unfamiliar shape emits
 * Java that will not compile at the exact moment the user said "approve".
 *
 * The synthetic sample below carries, deliberately, every shape the real
 * templates carry: a brace inside a string, a nested record, an overloaded
 * public entry point, a helper used twice, a helper used once, a node factory
 * that takes no builder, and a `Path` constant that is infrastructure rather
 * than a design token.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { classify, emit, inspect, pascal } from "../lib/bundle-split.mjs";

const NEWLINE = String.fromCharCode(10);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const SAMPLE = `package com.example;

import java.nio.file.Path;

/** A template. */
public final class DemoTemplate {

    private static final Path REVISION_DIR = Path.of(
            System.getProperty("graphcompose.revision.dir", "."));

    private static final double LABEL_SIZE = 8.65;
    private static final String TITLE = "a } brace in a string";
    private static final Map<String, IconAsset> ICONS = readIconManifest();

    private record IconAsset(String name, double size) {
    }

    public void compose(DocumentSession document, DemoSpec spec) {
        renderMasthead(document, spec);
        renderFooter(document, spec);
    }

    public void compose(DocumentSession document, CanonicalSpec spec) {
        compose(document, DemoSpec.from(spec));
    }

    public String getTemplateId() {
        return "demo";
    }

    private void renderMasthead(SectionBuilder section, DemoSpec spec) {
        heading(section, "Masthead");
        section.add(marker(0));
        onlyHere(section, spec);
    }

    private void renderFooter(SectionBuilder section, DemoSpec spec) {
        heading(section, "Footer");
        section.add(marker(1));
    }

    private void heading(SectionBuilder section, String text) {
        section.addParagraph(p -> p.text(text).style(textStyle(LABEL_SIZE)));
    }

    private void onlyHere(SectionBuilder section, DemoSpec spec) {
        section.addParagraph(p -> p.text(spec.name()));
    }

    private DocumentNode marker(int index) {
        return new ShapeBuilder().build();
    }

    private static DocumentTextStyle textStyle(double size) {
        return DocumentTextStyle.builder().size(size).build();
    }

    private static String compact(String text) {
        return text.trim();
    }

    private static Map<String, IconAsset> readIconManifest() {
        return Map.of();
    }
}
`;

/**
 * The same template with an optional argument on a shared helper.
 *
 * Two of the fourteen templates in the maintainer's workspace carry exactly this
 * — `tracked(…)` on luma, `sectionLabel(…)` on alex-demidov — and both published
 * flat because the splitter counted the overload as a second member wanting the
 * same class name.
 */
const WITH_OVERLOADED_HELPER = SAMPLE.replace(
  "    private void onlyHere(",
  `    private void heading(SectionBuilder section, String text, double gap) {
        section.addParagraph(p -> p.text(text).style(textStyle(gap)));
    }

    private void onlyHere(`,
);

test("classify splits a generated template into theme, sections, composites and support", () => {
  const result = classify(SAMPLE);

  assert.equal(result.feasible, true, result.reason ?? "");
  assert.equal(result.className, "DemoTemplate");

  const sections = result.sections.map((s) => s.typeName).sort();
  assert.deepEqual(sections, ["FooterSection", "MastheadSection"]);
});

test("the public surface stays in the template class, overloads included", () => {
  const result = classify(SAMPLE);
  const names = result.template.map((m) => m.name);

  // Two `compose` overloads and the interface accessor. Classifying by shape
  // alone filed the invoice lane's second `compose` under composites, as a class
  // called `Compose`.
  assert.deepEqual(names, ["compose", "compose", "getTemplateId"]);
});

test("a helper used by two sections becomes a composite; one used by a single section does not", () => {
  const result = classify(SAMPLE);

  const composites = result.composites.map((c) => c.typeName).sort();
  assert.deepEqual(composites, ["Heading", "Marker"]);

  // `onlyHere` is Masthead's private detail. Giving it a file of its own is the
  // fragmentation the brief rules out.
  const masthead = result.sections.find((s) => s.typeName === "MastheadSection");
  assert.deepEqual((masthead.local ?? []).map((m) => m.name), ["onlyHere"]);
});

test("a node factory is a composite even without a builder parameter", () => {
  const result = classify(SAMPLE);
  const marker = result.composites.find((c) => c.typeName === "Marker");

  assert.ok(marker, "marker(int) returns a DocumentNode and draws");
  assert.equal(marker.params[0].type, "int");
});

test("constants are theme; a Path and a manifest lookup are not", () => {
  const result = classify(SAMPLE);

  const theme = result.theme.map((t) => t.name).sort();
  assert.deepEqual(theme, ["LABEL_SIZE", "TITLE", "textStyle"]);

  const support = result.support.map((s) => s.name).sort();
  assert.deepEqual(support, ["ICONS", "REVISION_DIR", "compact", "readIconManifest"]);
});

test("a brace inside a string literal does not end a declaration", () => {
  const result = classify(SAMPLE);
  const title = result.theme.find((t) => t.name === "TITLE");

  assert.ok(title, "TITLE survived the brace in its value");
  assert.match(title.text, /a \} brace/);
});

test("architecture-plan regions name the sections when the revision has one", () => {
  const plan = {
    componentMapping: [
      { region: "page-masthead", renderMethod: "renderMasthead", notes: "why it is built this way" },
    ],
  };
  const result = classify(SAMPLE, { plan });

  const masthead = result.sections.find((s) => s.name === "renderMasthead");
  assert.equal(masthead.typeName, "PageMastheadSection");
  assert.equal(masthead.notes, "why it is built this way");

  // Undeclared render methods are still sections. The plan enriches; it does
  // not select — charcoal-gold's plan omits its two container methods, and
  // treating it as the whole list demoted them to composites.
  assert.ok(result.sections.some((s) => s.typeName === "FooterSection"));
});

test("a plan naming a method the source does not declare is reported, not refused", () => {
  const plan = {
    componentMapping: [
      { region: "ghost", renderMethod: "renderGhost" },
      { region: "page-masthead", renderMethod: "renderMasthead" },
    ],
  };
  const result = classify(SAMPLE, { plan });

  // This used to refuse, and it cost a real bundle its layout: luma's plan has
  // named `renderParties` since revision-001 while the source has always
  // declared `renderParty(…)`. An entry that names nothing enriches nothing —
  // it is dropped, reported, and the rest of the plan still applies.
  assert.equal(result.feasible, true, result.reason ?? "");
  assert.deepEqual(result.planDrift, [{ region: "ghost", renderMethod: "renderGhost" }]);
  assert.ok(result.sections.some((s) => s.typeName === "PageMastheadSection"));
});

test("drift is reported even when the split refuses for another reason", () => {
  const plan = { componentMapping: [{ region: "ghost", renderMethod: "renderGhost" }] };
  const withField = SAMPLE.replace(
    "    private static final double LABEL_SIZE = 8.65;",
    "    private final BusinessTheme theme;\n    private static final double LABEL_SIZE = 8.65;",
  );
  const result = classify(withField, { plan });

  // The loop gate asks the same function and has to hear about both.
  assert.equal(result.feasible, false);
  assert.deepEqual(result.planDrift, [{ region: "ghost", renderMethod: "renderGhost" }]);
});

test("overloads are one member in one file, not a collision", () => {
  const result = classify(WITH_OVERLOADED_HELPER);

  assert.equal(result.feasible, true, result.reason ?? "");
  const heading = result.composites.filter((c) => c.typeName === "Heading");
  assert.equal(heading.length, 1, "two overloads, one composite");
  assert.equal(heading[0].overloads.length, 2);

  const files = emit(result, {
    source: WITH_OVERLOADED_HELPER,
    basePackage: "com.example",
    className: "DemoTemplate",
  }).files;
  const file = files.get("composites/Heading.java");
  assert.equal((file.match(/static void render\(/g) ?? []).length, 2);
  assert.ok(!files.has("composites/Heading2.java"));
});

test("a call to an overloaded helper is repointed once, for every arity", () => {
  const result = classify(WITH_OVERLOADED_HELPER);
  const files = emit(result, {
    source: WITH_OVERLOADED_HELPER,
    basePackage: "com.example",
    className: "DemoTemplate",
  }).files;

  const masthead = files.get("sections/MastheadSection.java");
  assert.match(masthead, /Heading\.render\(section, "Masthead"\)/);
  assert.ok(!/[^.]\bheading\(/.test(masthead), "no unqualified call is left behind");
});

test("a method several regions map to is named by none of them", () => {
  // slate-orange's plan maps both `masthead-identity` and `masthead-hairline`
  // to `renderMasthead`. Taking the last entry named that method after a region
  // it does not draw, and collided with the method that does.
  const plan = {
    componentMapping: [
      { region: "masthead-identity", renderMethod: "renderMasthead" },
      { region: "masthead-hairline", renderMethod: "renderMasthead" },
    ],
  };
  const result = classify(SAMPLE, { plan });

  assert.equal(result.feasible, true, result.reason ?? "");
  const masthead = result.sections.find((s) => s.name === "renderMasthead");
  assert.equal(masthead.typeName, "MastheadSection");
});

test("a region name the source already spells for itself yields to the source", () => {
  const plan = { componentMapping: [{ region: "footer", renderMethod: "renderMasthead" }] };
  const result = classify(SAMPLE, { plan });

  assert.equal(result.feasible, true, result.reason ?? "");
  assert.equal(result.sections.find((s) => s.name === "renderMasthead").typeName, "MastheadSection");
  assert.equal(result.sections.find((s) => s.name === "renderFooter").typeName, "FooterSection");
});

test("overloads that are not the same kind of thing are refused by name", () => {
  const confused = SAMPLE.replace(
    "    private void onlyHere(",
    "    private static DocumentTextStyle heading(double size) {\n"
      + "        return DocumentTextStyle.builder().size(size).build();\n"
      + "    }\n\n    private void onlyHere(",
  );
  const result = classify(confused);

  assert.equal(result.feasible, false);
  assert.match(result.reason, /overloads of heading/);
});

test("overloads that differ in visibility are refused by name", () => {
  const confused = SAMPLE.replace(
    "    private void onlyHere(",
    "    public void heading(SectionBuilder section, String text, int level) {\n"
      + "        heading(section, text);\n"
      + "    }\n\n    private void onlyHere(",
  );
  const result = classify(confused);

  assert.equal(result.feasible, false);
  assert.match(result.reason, /overloads of heading differ in visibility/);
});

test("instance state is refused rather than mangled", () => {
  const withField = SAMPLE.replace(
    "    private static final double LABEL_SIZE = 8.65;",
    "    private final BusinessTheme theme;\n    private static final double LABEL_SIZE = 8.65;",
  );
  const result = classify(withField);

  assert.equal(result.feasible, false);
  assert.match(result.reason, /instance field: theme/);
});

test("a constructor is refused", () => {
  const withCtor = SAMPLE.replace(
    "    public void compose(DocumentSession document, DemoSpec spec) {",
    "    public DemoTemplate(BusinessTheme theme) {\n        this.theme = theme;\n    }\n\n    public void compose(DocumentSession document, DemoSpec spec) {",
  );
  const result = classify(withCtor);

  assert.equal(result.feasible, false);
  assert.match(result.reason, /constructor/);
});

test("a nested class is refused; a nested record is not", () => {
  const withClass = SAMPLE.replace(
    "    private record IconAsset(String name, double size) {\n    }",
    "    private static final class Helper {\n    }",
  );
  const result = classify(withClass);

  assert.equal(result.feasible, false);
  assert.match(result.reason, /nested class: Helper/);
});

test("a nested interface travels to support the way a record does", () => {
  // serif-headline-cv's `ColumnFactory` is a lambda target for its band layout,
  // and that one line was the whole reason its bundle could not be a project.
  // Both are implicitly static, which is what makes them carryable.
  const withInterface = SAMPLE.replace(
    "    private record IconAsset(String name, double size) {\n    }",
    "    private record IconAsset(String name, double size) {\n    }\n\n"
      + "    private interface ColumnFactory {\n        BandColumn column(int index);\n    }",
  );
  const result = classify(withInterface);

  assert.equal(result.feasible, true, result.reason ?? "");
  assert.deepEqual(
    result.nestedTypes.map((t) => `${t.kind} ${t.name}`),
    ["record IconAsset", "interface ColumnFactory"],
  );

  const support = emit(result, {
    source: withInterface,
    basePackage: "com.example",
    className: "DemoTemplate",
  }).files.get("support/DemoSupport.java");
  assert.match(support, /public interface ColumnFactory/);
});

test("an instance field is refused with the change that would let it split", () => {
  // Three templates in the corpus hold `private final Map<String, SvgIcon>
  // iconCache = new HashMap<>()`, whose Javadoc says "parsed once per document".
  // Publishing it as a static would make that per-JVM and share a HashMap two
  // threads can corrupt — the author's decision, not the publisher's.
  const withField = SAMPLE.replace(
    "    private static final double LABEL_SIZE = 8.65;",
    "    private final Map<String, SvgIcon> iconCache = new HashMap<>();\n"
      + "    private static final double LABEL_SIZE = 8.65;",
  );
  const result = classify(withField);

  assert.equal(result.feasible, false);
  assert.match(result.reason, /instance field: iconCache/);
  assert.match(result.reason, /static final in the revision/);
});

test("a template with no render methods is refused", () => {
  const bare = `package com.example;

public final class BareTemplate {
    public void compose(DocumentSession document, DemoSpec spec) {
        document.pageFlow(page -> page.name("Bare"));
    }
}
`;
  const result = classify(bare);

  assert.equal(result.feasible, false);
  assert.match(result.reason, /no render\* methods/);
});

test("pascal folds every separator a region id or a method name can use", () => {
  assert.equal(pascal("sidebar-contact"), "SidebarContact");
  assert.equal(pascal("sidebar_contact"), "SidebarContact");
  assert.equal(pascal("sidebarContact"), "SidebarContact");
  assert.equal(pascal("page background"), "PageBackground");
});

// --- the real templates ------------------------------------------------------
//
// The synthetic sample above is the contract; these are the four files the
// contract has to survive. A rule that holds on a fixture and not on
// charcoal-gold's 1,051 lines is not a rule.

// Three of these were read from their real paths, which are not tracked in git,
// so CI checked one template out of four and said nothing about it: the guard
// below skipped the rest as "not in this checkout" on every run. They are copies
// under `fixtures/` now, for the reason `fixtures/README.md` already gives, and a
// missing one is a failure rather than a silent pass.
const REAL = [
  {
    label: "charcoal-gold revision-009, with its architecture plan",
    source: "scripts/test/fixtures/charcoal-gold-cv/revision-009.generated-template.java",
    plan: "scripts/test/fixtures/charcoal-gold-cv/revision-009.architecture-plan.json",
    sections: 17,
    named: "SidebarContactSection",
  },
  {
    label: "charcoal-gold revision-010, which has no plan",
    source: "scripts/test/fixtures/charcoal-gold-cv/revision-010.generated-template.java",
    plan: null,
    sections: 17,
    named: "ContactSection",
  },
  {
    label: "the published mint-editorial-cv bundle",
    source: "templates/mint-editorial-cv/src/MintEditorialCvTemplate.java",
    plan: null,
    sections: 13,
    named: "ContactSection",
  },
  {
    label: "the published olive-curve-invoice bundle",
    source: "scripts/test/fixtures/olive-curve-invoice/OliveCurveInvoiceTemplate.java",
    plan: null,
    sections: 15,
    named: "ItemsSection",
  },
];

for (const fixture of REAL) {
  test(`classifies ${fixture.label}`, () => {
    const source = path.join(repoRoot, fixture.source);
    const plan = fixture.plan ? JSON.parse(fs.readFileSync(path.join(repoRoot, fixture.plan), "utf8")) : null;
    const result = classify(fs.readFileSync(source, "utf8"), { plan });

    assert.equal(result.feasible, true, result.reason ?? "");
    assert.equal(result.sections.length, fixture.sections);
    assert.ok(
      result.sections.some((s) => s.typeName === fixture.named),
      `expected a ${fixture.named}, got ${result.sections.map((s) => s.typeName).join(", ")}`,
    );
    assert.ok(result.theme.length > 0, "a generated template has constants");
    assert.ok(
      result.template.some((m) => m.name === "compose"),
      "compose stays in the template class",
    );
    // Every method is accounted for exactly once: nothing is silently dropped,
    // and nothing is emitted twice.
    const placed = [
      ...result.sections.map((s) => s.name),
      ...result.sections.flatMap((s) => (s.local ?? []).map((m) => m.name)),
      ...result.composites.map((c) => c.name),
      ...result.support.filter((s) => s.params).map((s) => s.name),
      ...result.theme.filter((t) => t.params).map((t) => t.name),
      ...result.template.map((m) => m.name),
    ];
    assert.equal(new Set(placed).size, placed.length - duplicateOverloads(result.template));
  });
}

/** Overloads share a name legitimately; every other repeat is a bug. */
function duplicateOverloads(template) {
  const seen = new Set();
  let repeats = 0;
  for (const method of template) {
    if (seen.has(method.name)) repeats += 1;
    seen.add(method.name);
  }
  return repeats;
}

test("invoice-classic, which this flow did not generate, is refused by name", (t) => {
  const source = path.join(repoRoot, "templates", "invoice-classic", "src", "InvoiceClassicTemplate.java");
  if (!fs.existsSync(source)) {
    t.skip("invoice-classic is not in this checkout");
    return;
  }
  const result = classify(fs.readFileSync(source, "utf8"));

  assert.equal(result.feasible, false);
  assert.match(result.reason, /instance field: theme/);
});

// --- emitting -----------------------------------------------------------------

const EMIT_OPTIONS = { source: SAMPLE, basePackage: "com.example", className: "DemoTemplate" };

test("emit lays the bundle out as theme, sections, composites, support and a template", () => {
  const { files } = emit(classify(SAMPLE), EMIT_OPTIONS);

  const paths = [...files.keys()].sort();
  assert.deepEqual(paths, [
    "DemoTemplate.java",
    "composites/Heading.java",
    "composites/Marker.java",
    "sections/FooterSection.java",
    "sections/MastheadSection.java",
    "support/DemoSupport.java",
    "theme/DemoTheme.java",
  ]);
});

test("the template class reads as a table of contents", () => {
  const { files } = emit(classify(SAMPLE), EMIT_OPTIONS);
  const template = files.get("DemoTemplate.java");

  assert.match(template, /MastheadSection\.render\(document, spec\)/);
  assert.match(template, /FooterSection\.render\(document, spec\)/);
  // The entry point keeps its signature: it is the contract a consumer calls.
  assert.match(template, /public void compose\(DocumentSession document, DemoSpec spec\)/);
  assert.doesNotMatch(template, /private void render/);
});

test("a section carries its own render method and its section-local helper", () => {
  const { files } = emit(classify(SAMPLE), EMIT_OPTIONS);
  const masthead = files.get("sections/MastheadSection.java");

  assert.match(masthead, /^package com\.example\.sections;/);
  assert.match(masthead, /public static void render\(SectionBuilder section, DemoSpec spec\)/);
  assert.match(masthead, /private static void onlyHere\(SectionBuilder section, DemoSpec spec\)/);
  assert.match(masthead, /Heading\.render\(section, "Masthead"\)/);
  assert.match(masthead, /Marker\.create\(0\)/);
});

test("a composite renders when it appends and creates when it returns a node", () => {
  const { files } = emit(classify(SAMPLE), EMIT_OPTIONS);

  assert.match(files.get("composites/Heading.java"), /public static void render\(/);
  assert.match(files.get("composites/Marker.java"), /public static DocumentNode create\(/);
});

test("constants reach every file by static import, not by rewritten references", () => {
  const { files } = emit(classify(SAMPLE), EMIT_OPTIONS);
  const theme = files.get("theme/DemoTheme.java");
  const heading = files.get("composites/Heading.java");

  assert.match(theme, /public static final double LABEL_SIZE = 8\.65;/);
  assert.match(heading, /import static com\.example\.theme\.DemoTheme\.\*;/);
  // 71 constants in the real template: qualifying each use is 71 chances to
  // corrupt a literal, for nothing.
  assert.match(heading, /textStyle\(LABEL_SIZE\)/);
  assert.doesNotMatch(heading, /DemoTheme\.LABEL_SIZE/);
});

test("infrastructure is not filed among the composites", () => {
  const { files } = emit(classify(SAMPLE), EMIT_OPTIONS);
  const support = files.get("support/DemoSupport.java");

  assert.match(support, /^package com\.example\.support;/);
  assert.match(support, /public record IconAsset\(/);
  assert.match(support, /public static final Path REVISION_DIR/);
  assert.match(support, /public static Map<String, IconAsset> readIconManifest\(\)/);
});

test("every holder of statics refuses instantiation; the template does not", () => {
  const { files } = emit(classify(SAMPLE), EMIT_OPTIONS);

  assert.match(files.get("theme/DemoTheme.java"), /private DemoTheme\(\) \{/);
  assert.match(files.get("sections/FooterSection.java"), /private FooterSection\(\) \{/);
  assert.doesNotMatch(files.get("DemoTemplate.java"), /private DemoTemplate\(\) \{/);
});

test("a method reference to a moved method is repointed too", () => {
  const withRef = SAMPLE.replace(
    '        heading(section, "Footer");',
    '        section.addSection("Inner", this::renderMasthead);',
  );
  const { files } = emit(classify(withRef), { ...EMIT_OPTIONS, source: withRef });

  // The invoice lane has exactly one of these. A rewriter that only knew about
  // a name followed by a bracket would have left it pointing at a method that
  // no longer exists.
  assert.match(files.get("sections/FooterSection.java"), /MastheadSection::render/);
  assert.doesNotMatch(files.get("sections/FooterSection.java"), /this::renderMasthead/);
});

test("a moved member keeps the Javadoc that says why it is what it is", () => {
  const documented = SAMPLE.replace(
    "    private static final double LABEL_SIZE = 8.65;",
    "    /** Calibrated against the first render, not estimated. */\n    private static final double LABEL_SIZE = 8.65;",
  );
  const { files } = emit(classify(documented), { ...EMIT_OPTIONS, source: documented });

  assert.match(files.get("theme/DemoTheme.java"), /Calibrated against the first render/);
});

test("an architecture-plan note becomes the section's class comment", () => {
  const plan = {
    componentMapping: [
      {
        region: "page-masthead",
        renderMethod: "renderMasthead",
        notes: "Page backgrounds, not section fills: they reach all four paper edges.",
      },
    ],
  };
  const { files } = emit(classify(SAMPLE, { plan }), EMIT_OPTIONS);

  const section = files.get("sections/PageMastheadSection.java");
  assert.match(section, /page-masthead/);
  assert.match(section, /reach all four paper edges/);
});

test("emitting an infeasible split is refused rather than attempted", () => {
  const withField = SAMPLE.replace(
    "    private static final double LABEL_SIZE = 8.65;",
    "    private final BusinessTheme theme;\n    private static final double LABEL_SIZE = 8.65;",
  );
  assert.throws(
    () => emit(classify(withField), { ...EMIT_OPTIONS, source: withField }),
    /instance field: theme/,
  );
});

test("every emitted file can see every other, because the rewriter reaches all of them", () => {
  // `rewriteCalls` runs over each moved member, so a composite that calls a
  // section emits `XSection.render(…)` into `composites/`. Sections were once
  // imported only by the template class, and that call did not resolve — a
  // failure the compile gate found only after the bundle was on disk.
  const calling = SAMPLE.replace(
    '    private void heading(SectionBuilder section, String text) {',
    "    private void heading(SectionBuilder section, String text) {\n        renderFooter(section, null);",
  );
  const { files } = emit(classify(calling), { ...EMIT_OPTIONS, source: calling });
  const composite = files.get("composites/Heading.java");

  assert.match(composite, /FooterSection\.render\(/, "the call was rewritten");
  assert.match(composite, /import com\.example\.sections\.\*;/, "but the class it names is not imported");
});

test("no emitted file imports itself", () => {
  const { files } = emit(classify(SAMPLE), EMIT_OPTIONS);

  // A class cannot static-import its own members, and a file does not import
  // its own package. Handing every file the same list without subtracting its
  // own entry is how that happens.
  assert.doesNotMatch(
    files.get("theme/DemoTheme.java"),
    /import static com\.example\.theme\.DemoTheme\.\*;/,
  );
  assert.doesNotMatch(
    files.get("support/DemoSupport.java"),
    /import (static )?com\.example\.support\.DemoSupport\.\*;/,
  );
  assert.doesNotMatch(files.get("composites/Heading.java"), /import com\.example\.composites\.\*;/);
  assert.doesNotMatch(files.get("sections/FooterSection.java"), /import com\.example\.sections\.\*;/);
  assert.doesNotMatch(files.get("DemoTemplate.java"), /import com\.example\.\*;/);
});

test("emitted sources parse back cleanly and reference nothing that moved away", () => {
  for (const fixture of REAL) {
    const source = path.join(repoRoot, fixture.source);
    if (!fs.existsSync(source)) continue;

    const text = fs.readFileSync(source, "utf8");
    const plan = fixture.plan
      ? JSON.parse(fs.readFileSync(path.join(repoRoot, fixture.plan), "utf8"))
      : null;
    const result = classify(text, { plan });
    const { files } = emit(result, {
      source: text,
      basePackage: "com.example.doc",
      className: result.className,
    });

    const movedNames = [
      ...result.sections.map((s) => s.name),
      ...result.composites.map((c) => c.name),
    ];

    for (const [rel, content] of files) {
      assert.match(content, /^package com\.example\.doc/, `${fixture.label}: ${rel} has a package`);
      assert.ok(content.trim().endsWith("}"), `${fixture.label}: ${rel} is closed`);

      // Nothing may still call a method by the name it had before it moved: a
      // surviving bare call is a call into a class that no longer declares it,
      // and it would only surface at compile time.
      for (const name of movedNames) {
        assert.doesNotMatch(
          content,
          new RegExp(`(^|[^\\w.$"])${name}\\s*\\(`, "m"),
          `${fixture.label}: ${rel} still calls ${name}`,
        );
      }
    }
  }
});

test("a plan note that cannot be published is dropped, and named", () => {
  // The note becomes the section class's Javadoc, so it leaves the harness.
  // One of the 1,576 notes in the corpus ends "that trade was tried in
  // revision-004 and reversed": true, useful in the plan, and a blocking
  // portability finding once it is inside a published .java. It used to abort
  // the publish after the files were on disk, pointing at a generated file
  // rather than at the plan.
  const plan = {
    componentMapping: [
      {
        region: "page-masthead",
        renderMethod: "renderMasthead",
        notes: "The band is one fixed background; the alternative was tried in revision-004.",
      },
      { region: "page-footer", renderMethod: "renderFooter", notes: "why it is built this way" },
    ],
  };
  const result = classify(SAMPLE, { plan });

  assert.equal(result.feasible, true, result.reason ?? "");
  assert.deepEqual(
    result.notesDropped.map((n) => ({ region: n.region, rule: n.rule })),
    [{ region: "page-masthead", rule: "revision-vocabulary" }],
  );

  const files = emit(result, {
    source: SAMPLE,
    basePackage: "com.example",
    className: "DemoTemplate",
  }).files;
  assert.ok(!files.get("sections/PageMastheadSection.java").includes("revision-004"));
  // The section is still there, still named by its region, and the note that
  // could be published still is.
  assert.ok(files.has("sections/PageMastheadSection.java"));
  assert.match(files.get("sections/PageFooterSection.java"), /why it is built this way/);
});

test("a plain block comment above a constant is its comment, not a doorway to the file", () => {
  // charcoal-gold documents SKILL_PITCH with a `/* ... */` block. Walking back
  // for `/**` alone stepped over its opener and kept going to the previous
  // Javadoc, so everything in between — six other declarations — travelled as
  // that constant's comment. The bundle compiled to "variable CONTACT_PITCH is
  // already defined", and `unaccountedLine` had been told those lines were
  // claimed, so the quieter outcome was a duplicate nobody saw.
  const source = SAMPLE.replace(
    "    private static final double LABEL_SIZE = 8.65;",
    `    private static final double LABEL_SIZE = 8.65;
    /*
     * Why the pitch is what it is, at length, and not in Javadoc.
     */
    private static final double SKILL_PITCH = 16.6;`,
  );
  const result = classify(source);

  assert.equal(result.feasible, true, result.reason ?? "");
  const theme = emit(result, {
    source,
    basePackage: "com.example",
    className: "DemoTemplate",
  }).files.get("theme/DemoTheme.java");

  assert.equal((theme.match(/LABEL_SIZE/g) ?? []).length, 1, "LABEL_SIZE was carried twice");
  assert.match(theme, /Why the pitch is what it is/);
  assert.ok(!/private static final double LABEL_SIZE/.test(theme), "a raw copy came through");
});

test("a record's own methods are opened up when it moves to another package", () => {
  // orange-ops-cv declares `record FaceMetrics(...)` with four package-private
  // methods and calls them from the sections. Inside one class that is fine;
  // once the record is in `support/` and the caller in `sections/`, javac says
  // "lineBox(double) is not public in FaceMetrics; cannot be accessed from
  // outside package" and the bundle does not compile.
  const source = SAMPLE.replace(
    "    private record IconAsset(String name, double size) {\n    }",
    [
      "    private record IconAsset(String name, double size) {",
      "",
      "        double lineBox(double scale) {",
      "            return size * scale;",
      "        }",
      "",
      "        private String label() {",
      "            return name;",
      "        }",
      "    }",
    ].join(NEWLINE),
  );
  const result = classify(source);
  assert.equal(result.feasible, true, result.reason ?? "");

  const support = emit(result, {
    source,
    basePackage: "com.example",
    className: "DemoTemplate",
  }).files.get("support/DemoSupport.java");

  assert.match(support, /public double lineBox\(double scale\)/);
  assert.match(support, /public String label\(\)/);
  assert.ok(!/\n        double lineBox/.test(support), "a package-private method survived");
});

test("a token computed from infrastructure moves to it, so the two clinits cannot cycle", () => {
  // orange-ops-cv computes DISPLAY_AVAILABLE — a boolean, so: theme — from a
  // Path, so: support, while a dozen support constants compute their spacing
  // from theme sizes. Theme's initialiser triggered Support's, which read
  // Theme's half-initialised constants as zero, and the bundle rendered 4.5%
  // away from the revision it claimed to be, compiling and running all the way.
  const source = SAMPLE.replace(
    "    private static final double LABEL_SIZE = 8.65;",
    [
      "    private static final Path FONT_FILE = REVISION_DIR.resolve(\"Display.ttf\");",
      "    private static final boolean DISPLAY_AVAILABLE = Files.isRegularFile(FONT_FILE);",
      "    private static final double LABEL_SIZE = 8.65;",
    ].join(NEWLINE),
  );
  const result = classify(source);
  assert.equal(result.feasible, true, result.reason ?? "");

  const support = result.support.map((m) => m.name);
  assert.ok(support.includes("DISPLAY_AVAILABLE"), "the boolean stayed in theme and closed a cycle");
  assert.ok(!result.theme.some((m) => m.name === "DISPLAY_AVAILABLE"));

  // And it lands after what it reads: within one class a simple-name forward
  // reference does not compile.
  const fields = result.support.filter((m) => m.params === undefined && m.kind === undefined);
  const names = fields.map((m) => m.name);
  assert.ok(names.indexOf("FONT_FILE") < names.indexOf("DISPLAY_AVAILABLE"), names.join(", "));

  // A constant that reads nothing infrastructural is still a design token.
  assert.ok(result.theme.some((m) => m.name === "LABEL_SIZE"));
});

// --- what only javac or a renderer would have found ---------------------------
//
// Three defects reached a real publish, and all three cleared this suite on the
// way: a duplicated declaration, a static-initialisation cycle between theme and
// support, and a record method left package-private. `inspect` reads the emitted
// text for exactly those, so the next one is caught in a second rather than in a
// Maven build somewhere else.

/** The demo template, split, as `inspect` receives it. */
function splitOf(source = SAMPLE, plan = null) {
  const classification = classify(source, { plan });
  assert.equal(classification.feasible, true, classification.reason ?? "");
  const files = emit(classification, {
    source,
    basePackage: "com.example",
    className: "DemoTemplate",
  }).files;
  return { classification, files };
}

test("a clean split has nothing to report", () => {
  const { classification, files } = splitOf();
  assert.deepEqual(inspect(classification, files), []);
});

test("a declaration carried twice into one file is caught", () => {
  // The shape the comment walk produced: a constant, and the same constant
  // again inside the block of text that travelled as another member's comment.
  const { classification, files } = splitOf();
  const theme = files.get("theme/DemoTheme.java");
  files.set(
    "theme/DemoTheme.java",
    theme.replace("public static final double LABEL_SIZE = 8.65;",
      "public static final double LABEL_SIZE = 8.65;\n\n    public static final double LABEL_SIZE = 8.65;"),
  );

  const findings = inspect(classification, files);
  assert.deepEqual(findings.map((f) => f.kind), ["duplicate-declaration"]);
  assert.match(findings[0].detail, /LABEL_SIZE is declared twice/);
});

test("a theme constant initialised from support is caught, because a cycle renders rather than fails", () => {
  // orange-ops-cv's DISPLAY_AVAILABLE. `relocateCyclicTokens` prevents it, so
  // the input here is built rather than classified — the point of the check is
  // that it holds if that ever stops working.
  const { files } = splitOf();
  const classification = {
    theme: [{ name: "DISPLAY_AVAILABLE", line: 10, initialiser: " Files.isRegularFile(FONT_FILE);" }],
    support: [{ name: "FONT_FILE", line: 8, initialiser: " Path.of(\"x\");" }],
  };

  const findings = inspect(classification, files);
  assert.deepEqual(findings.map((f) => f.kind), ["initialiser-cycle"]);
  assert.match(findings[0].detail, /DISPLAY_AVAILABLE/);
});

test("a record method left package-private is caught, and an interface method is not", () => {
  const { classification, files } = splitOf();
  const support = files.get("support/DemoSupport.java");
  assert.match(support, /public record IconAsset/);
  files.set(
    "support/DemoSupport.java",
    support.replace("    public record IconAsset(String name, double size) {",
      "    public record IconAsset(String name, double size) {\n        double area() {\n            return size * size;\n        }\n"),
  );

  const findings = inspect(classification, files);
  assert.deepEqual(findings.map((f) => f.kind), ["unreachable-member"]);
  assert.match(findings[0].detail, /IconAsset declares double area/);
});

test("every real template splits into a set that inspects clean", (t) => {
  // The fixtures the classification rules are already pinned against. A rule
  // that holds on the synthetic sample and not on 1,051 lines is not a rule,
  // and the same is true of the emitted text.
  let checked = 0;
  for (const fixture of REAL) {
    const file = path.join(repoRoot, fixture.source);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    const plan = fixture.plan
      ? JSON.parse(fs.readFileSync(path.join(repoRoot, fixture.plan), "utf8"))
      : null;
    const classification = classify(source, { plan });
    assert.equal(classification.feasible, true, `${fixture.label}: ${classification.reason ?? ""}`);
    const files = emit(classification, {
      source,
      basePackage: "com.example",
      className: classification.className,
    }).files;
    assert.deepEqual(
      inspect(classification, files),
      [],
      `${fixture.label} emitted a set javac would refuse`,
    );
    checked += 1;
  }
  if (checked === 0) t.skip("no real templates in this checkout");
});
