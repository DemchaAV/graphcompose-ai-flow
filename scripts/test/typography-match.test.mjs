#!/usr/bin/env node
/**
 * scripts/test/typography-match.test.mjs — can it name a face it has seen?
 *
 * The verification the plan asks for: render a known string in a known family,
 * feed its own crop back in, and assert rank 1 is that family. Six of those
 * crops are committed under `fixtures/typography-crops/`, rendered for real by
 * the preview-renderer at 200 dpi — so the ranking is exercised against actual
 * letterforms rather than against numbers typed into a test.
 *
 * The scoring runs here through ImageMagick, which the harness already requires
 * and `preflight` already checks. The *rendering* half does not: building a
 * specimen needs Maven and a JVM, and `npm test` is the pure-Node suite. So the
 * crops are committed and the pipeline that produced them is documented beside
 * them, which keeps this suite fast and still tests the part that decides.
 *
 * The most important test in the file is the one asserting `search` **cannot**
 * answer without a scale. The first implementation scored sizes through the
 * family metric, which normalises scale away by design, and confidently
 * reported "best 28 — a clear minimum" for a crop that was 24pt. Every number
 * in it came from rendering noise.
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ALL_FAMILIES,
  BUNDLED_FAMILIES,
  CORE_FAMILIES,
  needsBundledFonts,
  specimenPom,
  specimenSource,
  validateFamilies,
} from "../lib/typography-specimen.mjs";
import {
  SHAPE_BLUR,
  SHAPE_BOX,
  TRIM_FUZZ_PERCENT,
  expandCandidates,
  impliedSize,
  nodeToPixelRect,
  numericRange,
  rank,
  scoreCandidate,
  scoreSize,
  searchCurve,
} from "../lib/typography-match.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(repoRoot, "scripts", "typography.mjs");
const CROPS = path.join(repoRoot, "scripts", "test", "fixtures", "typography-crops");
const MAGICK = process.env.MAGICK_BINARY || "magick";

const FAMILIES = ["LATO", "PT_SERIF", "POPPINS", "JETBRAINS_MONO", "BARLOW_CONDENSED", "CRIMSON_TEXT"];
const cropOf = (family) => path.join(CROPS, `${family}.png`);

const cli = (...argv) => spawnSync(process.execPath, [CLI, ...argv], { encoding: "utf8", cwd: repoRoot });

const magick = (argv) => spawnSync(MAGICK, argv, { encoding: "utf8" });
const haveMagick = magick(["-version"]).status === 0;

// ------------------------------------------------------------ pure: ranges ---

test("a numeric range is rebuilt from the start, so its labels are typable", () => {
  // Accumulating 0.1 forty times lands on 10.500000000000004, and the number a
  // reviewer is handed has to be the one they would type into the template.
  assert.deepEqual(numericRange(10, 11, 0.25), [10, 10.25, 10.5, 10.75, 11]);
  assert.ok(numericRange(9, 12, 0.1).includes(10.5));
  assert.deepEqual(numericRange(8, 8, 1), [8]);
  assert.throws(() => numericRange(10, 9, 1), TypeError);
  assert.throws(() => numericRange(9, 10, 0), TypeError);
});

test("candidates are the cross product, and each gets its own name", () => {
  const candidates = expandCandidates({ families: ["LATO", "UBUNTU"], sizes: [10, 12] });
  assert.equal(candidates.length, 4);
  assert.equal(new Set(candidates.map((c) => c.id)).size, 4, "names tie a paragraph back to its candidate");
  assert.throws(() => expandCandidates({ families: [], sizes: [10] }), TypeError);
});

// ------------------------------------------------------- pure: the specimen ---

test("a family the pinned pack does not declare is refused before it becomes Java", () => {
  // The closed-set rule, applied where it would otherwise surface as a compile
  // error inside a generated file the caller never asked to see.
  assert.throws(() => validateFamilies(["LATO", "COMIC_SANS"]), /not FontName constants/);
  assert.deepEqual(validateFamilies(["LATO", "TIMES_ROMAN"]), ["LATO", "TIMES_ROMAN"]);
  assert.equal(ALL_FAMILIES.length, BUNDLED_FAMILIES.length + CORE_FAMILIES.length);
});

test("the specimen puts every candidate in one document", () => {
  // Twenty renders for twenty candidates is what item 37 forbids, and it would
  // be unusable inside a loop with a budget of eight passes.
  const candidates = expandCandidates({ families: FAMILIES, sizes: [24] });
  const source = specimenSource({ candidates, text: "Handgloves 0123" });
  for (const family of FAMILIES) assert.match(source, new RegExp(`FontName\\.${family}\\b`));
  assert.equal((source.match(/addParagraph/g) ?? []).length, FAMILIES.length);
  assert.equal((source.match(/pageFlow/g) ?? []).length, 1);
});

test("the specimen text is escaped, since it comes off a command line", () => {
  const source = specimenSource({
    candidates: expandCandidates({ families: ["LATO"], sizes: [10] }),
    text: 'He said "no"\\ever',
  });
  assert.match(source, /TEXT = "He said \\"no\\"\\\\ever"/);
});

test("the fonts artifact is pulled in only when a bundled family needs it", () => {
  // The Google fonts left the core artifact at 1.8.0. A specimen of the
  // fourteen core PDF faces has no reason to resolve a second dependency.
  assert.equal(needsBundledFonts([{ family: "HELVETICA" }, { family: "COURIER" }]), false);
  assert.equal(needsBundledFonts([{ family: "HELVETICA" }, { family: "LATO" }]), true);

  const core = specimenPom({ graphComposeVersion: "2.2.1", fontsVersion: "1.1.0", needsFonts: false });
  assert.ok(!core.includes("graph-compose-fonts"));
  const bundled = specimenPom({ graphComposeVersion: "2.2.1", fontsVersion: "1.1.0", needsFonts: true });
  assert.match(bundled, /graph-compose-fonts<\/artifactId>\s*\n\s*<version>1\.1\.0</);
});

// --------------------------------------------------------- pure: the scoring ---

test("width and shape are scored separately, and both are zero for a perfect match", () => {
  const perfect = scoreCandidate({
    referenceInk: { width: 500, height: 64 },
    candidateInk: { width: 500, height: 64 },
    shapeRmse: 0,
  });
  assert.equal(perfect.score, 0);
  assert.equal(perfect.widthRatio, 1);
});

test("a width penalty is symmetric — 10% narrower costs what 10% wider costs", () => {
  // A linear difference is not symmetric and would quietly prefer narrow faces.
  const wide = scoreCandidate({ referenceInk: { width: 100, height: 64 }, candidateInk: { width: 110, height: 64 }, shapeRmse: 0 });
  const narrow = scoreCandidate({ referenceInk: { width: 110, height: 64 }, candidateInk: { width: 100, height: 64 }, shapeRmse: 0 });
  assert.equal(wide.aspectPenalty, narrow.aspectPenalty);
});

test("the runner-up gap is reported, because a photo finish is not a result", () => {
  const ranked = rank([
    { family: "A", score: 0.10 },
    { family: "B", score: 0.101 },
    { family: "C", score: 0.9 },
  ]);
  assert.deepEqual(ranked.map((r) => r.family), ["A", "B", "C"]);
  assert.equal(ranked[0].rank, 1);
  assert.ok(ranked[0].separation < 0.002, "a caller reading only [0] would never know how close it was");
});

test("size is measured in points on both sides, not through the family metric", () => {
  const at24 = scoreSize({ referenceInkPt: 23.04, candidateInkPt: 23.4 });
  const at20 = scoreSize({ referenceInkPt: 23.04, candidateInkPt: 19.44 });
  assert.ok(at24.score < at20.score);
  assert.equal(scoreSize({ referenceInkPt: 10, candidateInkPt: 10 }).score, 0);
});

test("type scales linearly, so one measurement implies the size outright", () => {
  assert.equal(impliedSize({ referenceInkPt: 23.04, candidateInkPt: 23.4, candidateSize: 24 }), 23.6308);
  assert.equal(impliedSize({ referenceInkPt: 10, candidateInkPt: 0, candidateSize: 24 }), null);
});

test("a flat search curve is reported as flat, not as a winner", () => {
  // The failure this guards: four re-renders chasing a difference the
  // measurement cannot see.
  const flat = searchCurve([
    { size: 10, score: 0.30 },
    { size: 11, score: 0.301 },
    { size: 12, score: 0.302 },
    { size: 13, score: 0.303 },
  ]);
  assert.equal(flat.decisive, false);
  assert.ok(flat.indistinguishable.length > 1);

  const sharp = searchCurve([
    { size: 10, score: 3 },
    { size: 11, score: 1 },
    { size: 12, score: 0.02 },
    { size: 13, score: 1.4 },
  ]);
  assert.equal(sharp.decisive, true);
  assert.equal(sharp.best.size, 12);
});

// ------------------------------------------------------------ pure: geometry ---

test("a node's box lands in the image's pixels, with the y flip applied", () => {
  const canvas = { pageWidth: 595.276, pageHeight: 841.89 };
  const node = { placementX: 0, placementY: 813.09, placementWidth: 186.12, placementHeight: 28.8 };
  const rect = nodeToPixelRect(node, canvas, 200);
  assert.deepEqual(rect, { x: 0, y: 0, width: 517, height: 80 });
});

// --------------------------------------------------- against real letterforms ---

test("the committed crops are real renders of the six specimen families", () => {
  for (const family of FAMILIES) {
    assert.ok(fs.existsSync(cropOf(family)), `${family}.png is missing`);
    assert.ok(fs.statSync(cropOf(family)).size > 1000);
  }
});

test("fed a family's own crop, that family ranks first", { skip: !haveMagick && "ImageMagick is not on PATH" }, () => {
  // The plan's verification, run against pixels rather than against a stub.
  // Rendering the candidates needs Maven, so this exercises the half that
  // decides: normalise, measure, score, rank.
  const norm = (file, out) =>
    magick([
      file,
      "-colorspace", "Gray", "-auto-level",
      "-fuzz", `${TRIM_FUZZ_PERCENT}%`, "-trim", "+repage",
      "-resize", `${SHAPE_BOX.width}x${SHAPE_BOX.height}!`,
      "-blur", `0x${SHAPE_BLUR}`,
      out,
    ]);
  const ink = (file) => {
    const probe = magick([file, "-colorspace", "Gray", "-auto-level", "-fuzz", `${TRIM_FUZZ_PERCENT}%`, "-trim", "+repage", "-format", "%wx%h", "info:"]);
    const [width, height] = probe.stdout.trim().split("x").map(Number);
    return { width, height };
  };
  const rmse = (a, b) => {
    const spawned = magick(["compare", "-metric", "RMSE", a, b, "null:"]);
    const matched = /\(([\d.eE+-]+)\)/.exec(`${spawned.stderr ?? ""}${spawned.stdout ?? ""}`);
    return matched ? Number(matched[1]) : 0;
  };

  const scratch = fs.mkdtempSync(path.join(repoRoot, "scripts", "test", ".typo-"));
  try {
    const shapes = new Map(FAMILIES.map((f) => [f, path.join(scratch, `${f}.png`)]));
    for (const [family, out] of shapes) norm(cropOf(family), out);
    const inks = new Map(FAMILIES.map((f) => [f, ink(cropOf(f))]));

    for (const truth of FAMILIES) {
      const ranked = rank(
        FAMILIES.map((family) => ({
          family,
          ...scoreCandidate({
            referenceInk: inks.get(truth),
            candidateInk: inks.get(family),
            shapeRmse: rmse(shapes.get(truth), shapes.get(family)),
          }),
        })),
      );
      assert.equal(ranked[0].family, truth, `${truth} did not rank first against its own crop`);
      assert.equal(ranked[0].score, 0);
      assert.ok(ranked[0].separation > 0.05, `${truth} won by only ${ranked[0].separation}`);
    }
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test("the six families are genuinely distinguishable by width alone", { skip: !haveMagick && "ImageMagick is not on PATH" }, () => {
  // The signal the whole matcher leans on. The same string at the same size
  // runs from Barlow Condensed to JetBrains Mono with no overlap; if that ever
  // collapses, the ranking is running on the shape metric alone.
  const widths = FAMILIES.map((family) => {
    const probe = magick([cropOf(family), "-colorspace", "Gray", "-fuzz", `${TRIM_FUZZ_PERCENT}%`, "-trim", "+repage", "-resize", "x64", "-format", "%w", "info:"]);
    return Number(probe.stdout.trim());
  });
  const spread = Math.max(...widths) / Math.min(...widths);
  assert.ok(spread > 1.4, `the widest family is only ${spread.toFixed(2)}x the narrowest`);
});

// -------------------------------------------------------------------- CLI ----

test("search refuses without a scale, because a size cannot come from an unscaled crop", () => {
  // The bug this exists to prevent: the family metric normalises scale away, so
  // running a size sweep through it reported "best 28 — a clear minimum" for a
  // crop that was 24pt, off nothing but rendering noise.
  const result = cli("search", "--reference", cropOf("LATO"), "--text", "x", "--family", "LATO", "--from", "9", "--to", "12", "--step", "1");
  assert.equal(result.status, 2);
  assert.match(result.stderr, /needs --scale/);
  assert.match(result.stderr, /unknown resolution/);
});

test("the CLI refuses the arguments it cannot work from", () => {
  assert.equal(cli("match", "--text", "x").status, 2, "no reference");
  assert.equal(cli("match", "--reference", cropOf("LATO")).status, 2, "no text");
  assert.equal(cli("wibble", "--reference", cropOf("LATO"), "--text", "x").status, 2, "unknown command");
  assert.equal(cli("match", "--reference", "no/such.png", "--text", "x").status, 3, "no such crop");
  assert.equal(
    cli("search", "--reference", cropOf("LATO"), "--text", "x", "--from", "9", "--to", "12", "--step", "1", "--scale", "2").status,
    2,
    "search without a family",
  );
});

test("an unknown family fails before anything is compiled or rendered", () => {
  const result = cli("match", "--reference", cropOf("LATO"), "--text", "x", "--families", "COMIC_SANS");
  assert.notEqual(result.status, 0);
  assert.match(`${result.stderr}${result.stdout}`, /not FontName constants/);
});
