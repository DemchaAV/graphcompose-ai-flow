/**
 * scripts/lib/source-calibration.mjs — is this template a layout, or a
 * calibration of one reference at one size?
 *
 * ## Why
 *
 * The authoring rules say it plainly: derive geometry from a few base
 * constants, anchor rather than compute offsets, never bake today's font
 * metrics into the template. The corpus says how the loop actually closes a
 * mismatch under a pixel target. A real invoice template, approved and
 * published:
 *
 *     REFERENCE_PX_WIDTH = 1055.0;  PX = PAGE_W / REFERENCE_PX_WIDTH;
 *     MARGIN_L = px(51);  TITLE_SIZE = sizeB(46.53);
 *     CAP_RATIO_BOLD = 0.723;  TEXT_TOP_BEARING = 0.235;
 *     .margin(new DocumentInsets(px(668 - 648) - LINE_BOX * ITEM_TITLE_SIZE
 *             + TEXT_TOP_BEARING * (ITEM_TITLE_SIZE - ITEM_SUB_SIZE), 0, 0, 0))
 *
 * Every number there is a pixel read off the reference or a metric of one
 * face. Change the font, the page size or one line of data and every value
 * is wrong together — which is the definition of unmaintainable, and exactly
 * what the rules forbid. Nothing in the pipeline read the source for it, so
 * it went out as a bundle.
 *
 * This reads the source for it. Four shapes, each a regex over what a
 * template author writes, none of them a judgement about layout:
 *
 *   reference-pixel-scale       a scale from reference pixels to points, or a
 *                               px()/rpx()/ref() helper that applies one
 *   reference-pixel-arithmetic  that helper called on literals inside a render
 *                               method — `px(668 - 648)` is a measurement of
 *                               the reference written into the layout
 *   font-metric-constant        a named ratio of a face (cap height, bearing,
 *                               ascent) used as a layout term
 *   calibrated-literal          a size or inset with two or more decimals
 *                               (`sizeB(46.53)`, `padding(8.65)`): a value
 *                               nobody derived, found by moving it until the
 *                               diff was quiet
 *
 * A theme class may carry calibrated tokens — a type scale, margins, a
 * palette — that is what a theme is for, and a template that reads them by
 * name is fine. Findings are reported per file, so the gate can hold the
 * template to a higher standard than the theme.
 */

import { constants, methods } from "./java-outline.mjs";

/** Helper names that convert reference pixels to points. */
const PX_HELPER = /\b(px|rpx|refPx|fromRef|ref|scaled)\s*\(/;
const PX_HELPER_DEF = /\b(?:static\s+)?(?:float|double|int)\s+(px|rpx|refPx|fromRef|ref|scaled)\s*\(\s*(?:float|double|int)\s+\w+\s*\)/;
const REFERENCE_SCALE_NAME = /\b(REFERENCE_PX|REF_PX|REF_WIDTH|REFERENCE_WIDTH|PX_PER|PT_PER_PX|PX_SCALE|REF_SCALE)\w*\b/;
const FONT_METRIC_NAME = /\b\w*(CAP_RATIO|CAP_HEIGHT|X_HEIGHT|BEARING|ASCENT|DESCENT|LINE_BOX|EM_RATIO|BASELINE_RATIO)\w*\b/;
/** A literal with two or more decimals, as a layout or type argument. */
const CALIBRATED_CALL = /\b(margin|padding|spacing|size|fontSize|lineSpacing|width|height|offset|gap|inset|sizeB|sizeR|sizeM)\w*\s*\(([^()]*\d+\.\d{2,}[^()]*)\)/g;
const PX_ON_LITERALS = /\b(px|rpx|refPx|fromRef|ref|scaled)\s*\(\s*-?\d+(?:\.\d+)?\s*(?:[-+*/]\s*-?\d+(?:\.\d+)?\s*)*\)/g;

/** Default thresholds the gate applies to a template (not a theme). */
export const CALIBRATION_THRESHOLDS = Object.freeze({
  /** Any of these in a render method is a calibration. */
  referencePixelArithmetic: 1,
  /** Any named font metric used as a layout term. */
  fontMetricConstants: 1,
  /** More than this many two-decimal layout/type literals across the file. */
  calibratedLiterals: 10,
});

/**
 * @param {string} source one Java file
 * @param {{ role?: "template"|"theme"|"other", thresholds?: object }} [options]
 */
export function scanCalibration(source, options = {}) {
  const role = options.role ?? "template";
  const thresholds = { ...CALIBRATION_THRESHOLDS, ...(options.thresholds ?? {}) };
  const lines = source.split(/\r?\n/);
  const findings = [];

  // 1. A reference-pixel scale, by name or by helper definition.
  for (const c of constants(source)) {
    if (REFERENCE_SCALE_NAME.test(c.name) || /\/\s*\w*(REFERENCE|REF)_?(PX|WIDTH)\w*/.test(c.value)) {
      findings.push({
        kind: "reference-pixel-scale",
        line: c.line,
        name: c.name,
        detail: `${c.name} = ${c.value} — geometry is expressed in the reference's pixels, so it is a measurement of one image rather than a layout`,
      });
    }
    if (FONT_METRIC_NAME.test(c.name) && /\d/.test(c.value)) {
      findings.push({
        kind: "font-metric-constant",
        line: c.line,
        name: c.name,
        detail: `${c.name} = ${c.value} — a metric of one face used as a layout term; a different face makes every value derived from it wrong at once`,
      });
    }
  }
  for (let i = 0; i < lines.length; i += 1) {
    const def = PX_HELPER_DEF.exec(lines[i]);
    if (def && !/return\s+\w+\s*;/.test(lines[i])) {
      findings.push({
        kind: "reference-pixel-scale",
        line: i + 1,
        name: def[1],
        detail: `${def[1]}(…) converts reference pixels to points — every call site is a measurement of the reference`,
      });
    }
  }

  // 2. Per method: the helper on literals, and calibrated literals.
  const methodList = methods(source);
  const inMethod = (lineNo) => methodList.find((m) => lineNo >= m.line && lineNo <= m.endLine) ?? null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const method = inMethod(i + 1);
    for (const hit of line.matchAll(PX_ON_LITERALS)) {
      if (!method) continue; // constants are reported through the scale finding
      findings.push({
        kind: "reference-pixel-arithmetic",
        line: i + 1,
        method: method.name,
        name: hit[0],
        detail: `${hit[0]} in ${method.name}() — a pixel position read off the reference, written into the layout`,
      });
    }
    for (const hit of line.matchAll(CALIBRATED_CALL)) {
      const literals = hit[2].match(/\d+\.\d{2,}/g) ?? [];
      findings.push({
        kind: "calibrated-literal",
        line: i + 1,
        method: method?.name ?? null,
        name: `${hit[1]}(${literals.join(", ")})`,
        detail: `${hit[1]}(${hit[2].trim()})${method ? ` in ${method.name}()` : ""} — a value with ${literals[0]?.split(".")[1].length ?? 2} decimals nobody derived`,
      });
    }
  }

  const counts = {};
  for (const f of findings) counts[f.kind] = (counts[f.kind] ?? 0) + 1;

  // The gate. A theme may carry calibrated tokens; a template may not carry
  // reference arithmetic in its methods or a face's metrics as layout terms.
  const blocking = [];
  if (role === "template") {
    if ((counts["reference-pixel-arithmetic"] ?? 0) >= thresholds.referencePixelArithmetic) {
      blocking.push({
        id: "reference-pixel-arithmetic",
        detail: `${counts["reference-pixel-arithmetic"]} reference-pixel measurement(s) inside render methods`,
      });
    }
    if ((counts["font-metric-constant"] ?? 0) >= thresholds.fontMetricConstants) {
      blocking.push({
        id: "font-metric-constant",
        detail: `${counts["font-metric-constant"]} font-metric constant(s) used as layout terms`,
      });
    }
    if ((counts["calibrated-literal"] ?? 0) > thresholds.calibratedLiterals) {
      blocking.push({
        id: "calibrated-literals",
        detail: `${counts["calibrated-literal"]} two-decimal layout/type literals (limit ${thresholds.calibratedLiterals}); a type scale belongs in the theme, as named tokens`,
      });
    }
  }

  return {
    role,
    findings,
    counts,
    blocking,
    verdict: blocking.length ? "calibrated" : findings.length ? "leaning" : "derived",
    thresholds,
  };
}

/** Which of a revision's Java files is which. */
export function classifyJavaFile(name, source) {
  // The file name first: a template with a nested Theme class is still the
  // template, and must not be exempted from the gate by a substring in it.
  if (/Test\.java$/i.test(name)) return "other";
  if (/Spec(Provider)?\.java$/i.test(name)) return "other";
  if (/Template\.java$/i.test(name) || /generated-template\.java$/i.test(name)) return "template";
  if (/Theme\w*\.java$/i.test(name)) return "theme";
  // Only when the name says nothing: classify by the top-level class declared.
  const declared = /^\s*(?:public\s+)?(?:final\s+)?class\s+(\w+)/m.exec(source)?.[1] ?? "";
  if (/Template$/.test(declared)) return "template";
  if (/Theme$/.test(declared)) return "theme";
  return "other";
}
