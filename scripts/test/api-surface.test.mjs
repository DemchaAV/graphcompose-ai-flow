#!/usr/bin/env node
/**
 * scripts/test/api-surface.test.mjs — the allow-list describes what the
 * artifact actually has.
 *
 * The failure this guards against was not a missing method here or there. The
 * old indexer parsed GraphCompose's Java **source**, so every member Lombok
 * generates was invisible to it, and four value types whose entire construction
 * path is generated came out empty or near-empty:
 *
 *   DocumentMetadata (class)     ← nothing at all
 *   DocumentProtection (class)   ← nothing at all
 *   DocumentHeaderFooter (class) ← one hand-written method, no builder()
 *
 * Under the allow-list's first rule — "a symbol absent here does not exist" —
 * that made page headers and footers unconstructible, which is exactly what a
 * real 2.2.0 run concluded.
 *
 * Two layers are tested. The parser layer runs on fixture text, so it needs no
 * JDK and no jar and can run anywhere. The pinned-surface layer asserts against
 * the committed `api-surface.json`, so a regeneration that quietly loses the
 * generated members fails here rather than in someone's document six months on.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseJavap, simplifyType } from "../../tools/api-surface/lib/javap.mjs";
import { indexParameterNames, applyParameterNames, normalizeParamType } from "../../tools/api-surface/lib/source-names.mjs";
import { renderMarkdown } from "../../tools/api-surface/lib/render-markdown.mjs";
import { openJar } from "../../tools/api-surface/lib/zip.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACK = path.join(repoRoot, "skills", "versions", "graphcompose-2.2");

// --- the parser, on the shapes javap really emits -----------------------------

const LOMBOK_VALUE_TYPE = `Compiled from "DocumentHeaderFooter.java"
public final class com.demcha.compose.document.output.DocumentHeaderFooter {
  public com.demcha.compose.document.output.DocumentHeaderFooter withZone(com.demcha.compose.document.output.DocumentHeaderFooterZone);
  public static com.demcha.compose.document.output.DocumentHeaderFooter$DocumentHeaderFooterBuilder builder();
  public float getHeight();
  public boolean isShowSeparator();
}
Compiled from "DocumentHeaderFooter.java"
public class com.demcha.compose.document.output.DocumentHeaderFooter$DocumentHeaderFooterBuilder {
  public com.demcha.compose.document.output.DocumentHeaderFooter$DocumentHeaderFooterBuilder height(float);
  public com.demcha.compose.document.output.DocumentHeaderFooter build();
}
`;

test("a Lombok value type's generated construction path is read from bytecode", () => {
  const [value, builder] = parseJavap(LOMBOK_VALUE_TYPE);

  assert.equal(value.binaryName, "com.demcha.compose.document.output.DocumentHeaderFooter");
  assert.ok(
    value.members.some((m) => m.name === "builder" && m.static),
    "builder() was not read — this is the exact member the source parser could not see",
  );
  assert.equal(simplifyType(builder.binaryName), "DocumentHeaderFooter.DocumentHeaderFooterBuilder");
  assert.ok(builder.members.some((m) => m.name === "build"));
});

test("javap's erased forms are mapped back to record, enum and annotation", () => {
  const types = parseJavap(`public final class com.x.R extends java.lang.Record {
  public boolean enabled();
}
public final class com.x.E extends java.lang.Enum<com.x.E> {
  public static final com.x.E A;
}
public interface com.x.Marker extends java.lang.annotation.Annotation {
}
public class com.x.Plain {
  public void go();
}`);
  assert.deepEqual(
    types.map((t) => `${t.binaryName}:${t.kind}`),
    ["com.x.R:record", "com.x.E:enum", "com.x.Marker:annotation", "com.x.Plain:class"],
  );
});

test("package-private types are distinguishable from public ones", () => {
  // A jar holds both; only one is authoring surface.
  const types = parseJavap(`class com.x.Internal {
  public void go();
}
public class com.x.Exposed {
  public void go();
}`);
  assert.deepEqual(types.map((t) => t.isPublic), [false, true]);
});

test("generic methods keep their type parameters and generic arguments", () => {
  const [type] = parseJavap(`public class com.x.S {
  public <E extends com.x.Node> com.x.S register(com.x.Definition<E>);
  public com.x.S addAll(java.util.Collection<? extends com.x.Node>);
}`);
  assert.equal(type.members[0].typeParameters, "<E extends com.x.Node>");
  assert.equal(simplifyType(type.members[0].params[0].type), "Definition<E>");
  assert.equal(simplifyType(type.members[1].params[0].type), "Collection<? extends Node>");
});

test("a constructor is told apart from a method returning nothing", () => {
  const [type] = parseJavap(`public class com.x.Opts {
  public com.x.Opts(boolean, java.lang.String);
  public void apply();
}`);
  assert.equal(type.members[0].kind, "constructor");
  assert.equal(type.members[0].name, "Opts");
  assert.equal(type.members[1].kind, "method");
});

// --- parameter names come from source, and only names -------------------------

function fakeJar(files) {
  return {
    names: Object.keys(files),
    read: (name) => Buffer.from(files[name], "utf8"),
  };
}

test("parameter names are merged in from source, and generated members are marked", () => {
  const index = indexParameterNames(
    fakeJar({
      "com/x/Chrome.java": `package com.x;
public final class Chrome {
  public Chrome withZone(Zone zone) { return this; }
}`,
    }),
  );

  const withZone = { kind: "method", name: "withZone", params: [{ type: "Zone", name: null }] };
  assert.equal(applyParameterNames(index, "Chrome", withZone), "source");
  assert.equal(withZone.params[0].name, "zone");

  // builder() is nowhere in the source: that IS the definition of generated.
  const builder = { kind: "method", name: "builder", params: [] };
  assert.equal(applyParameterNames(index, "Chrome", builder), "generated");
});

test("a same-signature method on another type does not lend its parameter name", () => {
  // Borrowing gave `centerText(String text)` on a Lombok builder whose field is
  // `centerText` — a name that reads authoritative and is about a different
  // method entirely. No name is better than a wrong one.
  const index = indexParameterNames(
    fakeJar({
      "com/x/Other.java": `package com.x;
public final class Other {
  public Other centerText(String text) { return this; }
}`,
    }),
  );
  const member = { kind: "method", name: "centerText", params: [{ type: "String", name: null }] };
  assert.equal(applyParameterNames(index, "Chrome", member), "generated");
  assert.equal(member.params[0].name, null);
});

test("varargs, annotations and qualification do not defeat signature matching", () => {
  assert.equal(normalizeParamType("java.lang.String..."), "String[]");
  assert.equal(normalizeParamType("@Nullable final java.util.List<com.x.Node>"), "List<Node>");
  assert.equal(normalizeParamType("String[]"), "String[]");
});

// --- the rendering is a view of the JSON, not a second source -----------------

test("the Markdown renders constructors, generics and constants the documented way", () => {
  const markdown = renderMarkdown({
    targetLibrary: "GraphCompose",
    targetVersion: "2.2.x",
    verifiedAgainst: "2.2.0",
    generator: "tools/api-surface/extract-api.mjs",
    generatedFrom: ["io.github.demchaav:graph-compose-core:2.2.0"],
    counts: { types: 1, methods: 3, constants: 1, generated: 1 },
    packages: [
      {
        name: "com.x",
        types: [
          {
            name: "Opts",
            kind: "class",
            members: [
              { kind: "constructor", name: "Opts", params: [{ type: "boolean", name: "on" }] },
              { kind: "method", name: "builder", returns: "Opts.Builder", typeParameters: null, params: [] },
              {
                kind: "method",
                name: "map",
                returns: "Opts",
                typeParameters: "<T>",
                params: [{ type: "Fn<T>", name: null }],
              },
              { kind: "constant", name: "EMPTY", type: "Opts" },
            ],
          },
        ],
      },
    ],
  });

  assert.match(markdown, /- `new Opts\(boolean on\)`/);
  assert.match(markdown, /- `Opts\.Builder builder\(\)`/);
  assert.match(markdown, /- `<T> Opts map\(Fn<T>\)`/, "an unnamed parameter renders as its type alone");
  assert.match(markdown, /- constants: `EMPTY`/);
  assert.ok(!/lastValidated/.test(markdown), "a regenerated-today field would make --check drift every run");
});

// --- the jar reader -----------------------------------------------------------

test("the zip reader refuses a file that is not an archive", () => {
  const notAJar = path.join(repoRoot, "package.json");
  assert.throws(() => openJar(notAJar), /not a zip archive/);
});

// --- the pinned surface -------------------------------------------------------

const canonicalPath = path.join(PACK, "api-surface.json");
const canonical = JSON.parse(fs.readFileSync(canonicalPath, "utf8"));
const typeIndex = new Map();
for (const pkg of canonical.packages) {
  for (const type of pkg.types) typeIndex.set(type.name, type);
}

test("the pinned 2.2 surface is generated from the artifact, not from source", () => {
  // The line is the contract; the patch number is not. Asserting "2.2.0"
  // literally meant every patch release failed this test while telling nobody
  // anything — what has to hold is that the pack was generated by the extractor
  // from a real 2.2 artifact, and that it agrees with itself about which one.
  assert.match(canonical.verifiedAgainst, /^2\.2\./, `generated from ${canonical.verifiedAgainst}`);
  assert.equal(canonical.generator, "tools/api-surface/extract-api.mjs");
  assert.ok(
    canonical.generatedFrom.includes(`io.github.demchaav:graph-compose-core:${canonical.verifiedAgainst}`),
    `the core artifact is where the authoring classes live: ${canonical.generatedFrom.join(", ")}`,
  );
  assert.ok(
    canonical.generatedFrom.includes(`io.github.demchaav:graph-compose-templates:${canonical.verifiedAgainst}`),
    "the pack must not mix artifacts from two releases",
  );
});

/**
 * The four types named in the acceptance report, each entirely Lombok, each
 * previously unconstructible from the allow-list.
 */
for (const typeName of [
  "DocumentHeaderFooter",
  "DocumentMetadata",
  "DocumentWatermark",
  "DocumentProtection",
]) {
  test(`${typeName} is constructible: builder() and its builder type are both listed`, () => {
    const type = typeIndex.get(typeName);
    assert.ok(type, `${typeName} is missing from the surface entirely`);

    const builder = type.members.find((m) => m.name === "builder" && m.static);
    assert.ok(builder, `${typeName}.builder() is absent — the Lombok regression is back`);
    assert.equal(builder.origin, "generated");
    assert.equal(builder.returns, `${typeName}.${typeName}Builder`);

    const builderType = typeIndex.get(builder.returns);
    assert.ok(builderType, `${builder.returns} is absent, so builder() returns an undocumented type`);
    assert.ok(
      builderType.members.some((m) => m.name === "build"),
      `${builder.returns}.build() is absent, so the chain cannot be terminated`,
    );
  });
}

test("page enumeration is reachable from the footer builder", () => {
  // "Page {page} of {pages}" needs three things to be findable together:
  // somewhere to put the text, a numbering value, and a way to attach it.
  const footer = typeIndex.get("DocumentHeaderFooter.DocumentHeaderFooterBuilder");
  assert.ok(footer.members.some((m) => m.name === "centerText"));
  assert.ok(footer.members.some((m) => m.name === "numbering"));
  assert.ok(typeIndex.get("DocumentPageNumbering")?.members.some((m) => m.name === "builder"));
  assert.ok(typeIndex.get("DocumentHeaderFooterZone")?.members.some((m) => m.name === "FOOTER"));
});

test("a nested type is attributed to itself, not folded into its enclosing type", () => {
  // The source parser listed GraphCompose.DocumentBuilder's methods under
  // GraphCompose, so the allow-list claimed `GraphCompose.margin(...)` existed
  // as a static call. It does not.
  const graphCompose = typeIndex.get("GraphCompose");
  const builder = typeIndex.get("GraphCompose.DocumentBuilder");
  assert.ok(builder, "GraphCompose.DocumentBuilder is not listed as its own type");
  assert.ok(builder.members.some((m) => m.name === "margin"));
  assert.ok(
    !graphCompose.members.some((m) => m.name === "margin"),
    "DocumentBuilder's methods are still being attributed to GraphCompose",
  );
});

test("the surface carries enough generated members to be worth the change", () => {
  // A guard against a regeneration that silently falls back to source parsing:
  // the count would collapse rather than go slightly wrong.
  assert.ok(
    canonical.counts.generated > 500,
    `only ${canonical.counts.generated} generated members — the extractor is probably not reading bytecode`,
  );
  assert.ok(canonical.counts.types > 300);
});

test("no annotation or package-private type reached the authoring surface", () => {
  for (const [name, type] of typeIndex) {
    assert.notEqual(type.kind, "annotation", `${name} is an annotation, not authoring surface`);
  }
});

test("every nested type listed is reachable from the surface that returns it", () => {
  const mentioned = new Set();
  for (const type of typeIndex.values()) {
    for (const member of type.members) {
      const text =
        member.kind === "constant"
          ? member.type
          : [member.typeParameters, member.returns, ...member.params.map((p) => p.type)].filter(Boolean).join(" ");
      for (const name of text.match(/[A-Z][\w.]*/g) ?? []) mentioned.add(name);
    }
  }
  for (const name of typeIndex.keys()) {
    if (!name.includes(".")) continue;
    assert.ok(mentioned.has(name), `${name} is listed but nothing on the surface returns or takes it`);
  }
});

test("the committed Markdown is exactly what the committed JSON renders", () => {
  // The Markdown is a view. If it can disagree with the JSON, the agent reading
  // one and the tool querying the other are working from different allow-lists.
  const onDisk = fs.readFileSync(path.join(PACK, "00-api-surface.md"), "utf8").replace(/\r\n/g, "\n");
  assert.equal(onDisk, renderMarkdown(canonical));
});
