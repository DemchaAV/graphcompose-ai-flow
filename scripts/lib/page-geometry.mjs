/**
 * scripts/lib/page-geometry.mjs — what size the page actually is, measured.
 *
 * The page size used to be a thing the design stage assumed. Nothing in the
 * chain measured the reference, `visual-analysis.json` carried `page.format` as
 * a free-text string, and "A4" is what gets written when nobody made it look.
 * The gate did not catch it either: `visual-diff --scale-reference` resamples
 * the reference to the render's exact width AND height, so a reference that is
 * proportionally shorter than A4 is stretched to fit right before the pixels
 * are compared. The reviewer then reads a stretched reference against a render
 * that matches it, and reports parity.
 *
 * Measured on the projects on disk when this was written: `mocha-profile-cv`
 * has a reference at 589x754 (aspect 1.280) built as A4 (1.414) — every element
 * positioned against page height sits ~10% out. `navy-executive-cv` and
 * `cv-reference` are off by 4.2% and 4.9%. Three projects, three green gates.
 *
 * So the size is read off the file at import, before any design decision
 * depends on it. Reading a PNG header needs no ImageMagick and no build output:
 * the dimensions are two big-endian integers at a fixed offset, and keeping it
 * that cheap is what lets `import-reference` do this on every import instead of
 * behind a flag nobody passes.
 *
 * The verdict is deliberately three-valued. A reference within a hair of a
 * standard IS that standard — a screenshot loses a row of pixels to window
 * chrome and nobody should be asked about it. A reference close to nothing is a
 * question, not a guess: an aspect of 1.35 is equally consistent with "a
 * cropped A4" and "a custom page", the two answers produce visibly different
 * documents, and only the person holding the source knows which. Guessing there
 * is what produced the three broken projects above.
 */

import fs from "node:fs";

/**
 * The page sizes GraphCompose exposes as constants, in PDF points (1/72 inch).
 *
 * These are the three on the allow-list — `DocumentPageSize.A4`, `.LETTER`,
 * `.LEGAL`. The A series is one entry because aspect cannot tell A3 from A4
 * from A5: they share 1:root-2 by construction. Anything matched here as "A4"
 * may equally be an A3 poster, and the content decides that, not this table.
 */
export const STANDARD_PAGE_SIZES = [
  { name: "A4", widthPt: 595.276, heightPt: 841.89 },
  { name: "LETTER", widthPt: 612, heightPt: 792 },
  { name: "LEGAL", widthPt: 612, heightPt: 1008 },
];

/**
 * How far off a standard may be and still count as that standard, in percent
 * of the standard's own aspect.
 *
 * 1% is about eight pixels of height on an 800px-tall screenshot — the scale of
 * a lost title bar or a one-pixel crop, and below the scale at which a layout
 * reads as wrong. The three broken projects sit at 4.2%, 4.9% and 9.5%, so they
 * land clear of it on the "ask" side, which is the point.
 *
 * `tools/visual-diff/src/aspect.ts` carries the same number for its diff-time
 * warning; scripts/test/contracts.test.mjs asserts the two stay equal.
 */
export const ASPECT_TOLERANCE_PERCENT = 1.0;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Width and height of a PNG, from its IHDR.
 *
 * Throws rather than returning null: every caller is measuring a file the
 * harness itself just wrote, and a PNG that is not a PNG at that point is a bug
 * in the import, not a case to carry forward as `undefined`.
 */
export function readPngSize(file) {
  const fd = fs.openSync(file, "r");
  try {
    const head = Buffer.alloc(24);
    const read = fs.readSync(fd, head, 0, 24, 0);
    if (read < 24 || !head.subarray(0, 8).equals(PNG_SIGNATURE)) {
      throw new Error(`not a PNG: ${file}`);
    }
    return { widthPx: head.readUInt32BE(16), heightPx: head.readUInt32BE(20) };
  } finally {
    fs.closeSync(fd);
  }
}

/** Aspect as height/width, the way a page is described ("taller than wide"). */
export function aspectOf({ widthPx, heightPx }) {
  if (!(widthPx > 0) || !(heightPx > 0)) {
    throw new Error(`cannot take the aspect of ${widthPx}x${heightPx}`);
  }
  return heightPx / widthPx;
}

/** Percentage difference between two aspects, relative to the second. */
function deviationPercent(aspect, reference) {
  return (Math.abs(aspect - reference) / reference) * 100;
}

function round(n, places) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/**
 * Rank the standard sizes against a measured aspect, nearest first.
 *
 * Landscape is handled by comparing against the reciprocal rather than by a
 * second table: a landscape A4 is an A4 that was turned, and saying so keeps
 * `DocumentPageSize.A4.landscape()` as the thing the template writes.
 */
export function rankStandards(aspect) {
  const orientation = aspect >= 1 ? "portrait" : "landscape";
  return STANDARD_PAGE_SIZES.map((size) => {
    const portraitAspect = size.heightPt / size.widthPt;
    const candidateAspect = orientation === "portrait" ? portraitAspect : 1 / portraitAspect;
    return {
      name: size.name,
      orientation,
      widthPt: orientation === "portrait" ? size.widthPt : size.heightPt,
      heightPt: orientation === "portrait" ? size.heightPt : size.widthPt,
      aspect: round(candidateAspect, 5),
      deviationPercent: round(deviationPercent(aspect, candidateAspect), 2),
    };
  }).sort((a, b) => a.deviationPercent - b.deviationPercent);
}

/**
 * A custom page that keeps the measured proportions, anchored on a standard
 * width.
 *
 * Width is the anchor rather than height because width is what the rest of the
 * layout derives from — margins, column weights and gutters are all stated as
 * fractions of it — and because a page that keeps a standard width still prints
 * onto standard stock with a sane margin, while one that keeps the height does
 * not.
 *
 * `anchor` is a ranked candidate, which is already oriented: for a landscape
 * page `anchor.widthPt` is the long edge. Re-deciding that here on the sign of
 * the aspect swapped it a second time and produced a landscape page 595pt wide
 * — A4's short edge used as a width — instead of 842.
 */
export function customSizeFor(aspect, anchor) {
  return {
    widthPt: round(anchor.widthPt, 3),
    heightPt: round(anchor.widthPt * aspect, 3),
    anchoredOn: anchor.name,
  };
}

/**
 * Measure every page of a reference and say what page size to build at.
 *
 * `pages` is a list of PNG paths in page order. The return is the whole story,
 * not just the answer — the per-page measurements, the ranked standards and a
 * verdict — so a caller that has to put a question to the user has the numbers
 * to put in it.
 *
 * Verdicts:
 *   "standard"     — a standard is within tolerance. Build at it; no question.
 *   "ask"          — nothing is within tolerance. The nearest standard and an
 *                    exact custom size are both offered, and the user chooses:
 *                    the two produce visibly different documents and the file
 *                    alone cannot say which the source was.
 *   "inconsistent" — the pages disagree with each other by more than tolerance.
 *                    Nothing downstream can be right until that is resolved,
 *                    because a document has one page size: either the import
 *                    rasterised at mixed dpi, or the pages are not all from the
 *                    same document.
 */
export function measureReferenceGeometry(pages, options = {}) {
  const tolerance = options.tolerancePercent ?? ASPECT_TOLERANCE_PERCENT;
  if (!Array.isArray(pages) || pages.length === 0) {
    throw new Error("measureReferenceGeometry: no pages to measure");
  }

  const measured = pages.map((file, index) => {
    const size = readPngSize(file);
    return {
      page: index + 1,
      file,
      widthPx: size.widthPx,
      heightPx: size.heightPx,
      aspect: round(aspectOf(size), 5),
    };
  });

  // Page 1 is what the rest are judged against, because page 1 is what every
  // other tool in the chain already calls "the reference".
  const aspect = measured[0].aspect;
  const disagreeing = measured.filter((p) => deviationPercent(p.aspect, aspect) > tolerance);

  const candidates = rankStandards(aspect);
  const nearest = candidates[0];

  const base = {
    schemaVersion: 1,
    tolerancePercent: tolerance,
    aspect,
    orientation: nearest.orientation,
    pages: measured,
    candidates,
  };

  if (disagreeing.length > 0) {
    return {
      ...base,
      verdict: "inconsistent",
      disagreeingPages: disagreeing.map((p) => ({
        page: p.page,
        aspect: p.aspect,
        deviationPercent: round(deviationPercent(p.aspect, aspect), 2),
      })),
      question:
        `The reference pages do not share one aspect: page 1 is ${aspect}, ` +
        `${disagreeing.map((p) => `page ${p.page} is ${p.aspect}`).join(", ")}. ` +
        `A document has one page size, so this is either a mixed-dpi import or ` +
        `pages from two different sources. Resolve it before designing.`,
    };
  }

  if (nearest.deviationPercent <= tolerance) {
    return {
      ...base,
      verdict: "standard",
      pageSize: {
        source: "measured-standard",
        format: nearest.name,
        orientation: nearest.orientation,
        widthPt: nearest.widthPt,
        heightPt: nearest.heightPt,
        deviationPercent: nearest.deviationPercent,
      },
    };
  }

  // The consequence, spelled out, is what makes the question answerable. "1.28
  // against 1.41" is a pair of numbers; "the page ends up 10.5% taller than the
  // reference, and everything placed against page height moves with it" is a
  // decision someone can actually take.
  const stretchPercent = round(((nearest.aspect - aspect) / aspect) * 100, 2);
  const direction = stretchPercent > 0 ? "taller" : "shorter";
  const custom = customSizeFor(aspect, nearest);

  return {
    ...base,
    verdict: "ask",
    nearestStandard: nearest,
    custom,
    question:
      `The reference is ${measured[0].widthPx}x${measured[0].heightPx} (aspect ${aspect}). ` +
      `The nearest standard is ${nearest.name} ${nearest.orientation} (aspect ${nearest.aspect}), ` +
      `off by ${nearest.deviationPercent}%: building at ${nearest.name} makes the page ` +
      `${Math.abs(stretchPercent)}% ${direction} than the reference, and every element placed ` +
      `against page height moves by that much. Ask before designing — build at ` +
      `${nearest.name} (the reference is a cropped or rescaled shot of a standard page), or at ` +
      `the measured size DocumentPageSize.of(${custom.widthPt}, ${custom.heightPt}) ` +
      `(the source really is custom)?`,
  };
}
