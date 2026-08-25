/**
 * tools/asset-resolver/src/svg-compat.mjs — will GraphCompose draw this SVG?
 *
 * GraphCompose has an icon/vector subset, not a browser. `SvgIcon.parse(...)`
 * lowers `path`, `rect`, `circle`, `ellipse`, `line`, `polyline` and `polygon`
 * into path geometry, composes `translate` / `scale` / `rotate` / `matrix`
 * transforms, and reads presentation attributes and inline styles for paint.
 * Outside that it throws.
 *
 * The point of checking here rather than finding out at render time is that the
 * answer decides the file the resolver writes: an SVG the library can draw stays
 * an SVG — vector, scalable, a few hundred bytes — and only one it cannot is
 * rasterised. A resolver that rasterised everything, as this one used to, threw
 * away the vector for every icon in order to survive the rare one.
 *
 * The rules encode GraphCompose 2.2's documented behaviour, and the split that
 * matters is between what FAILS and what merely DEGRADES:
 *
 *   fails    no <svg> root · DOCTYPE · no viewBox and no usable width/height ·
 *            a path command outside M L H V C S Q T A Z · path data not
 *            starting with a moveto · skewX / skewY · relative units in a
 *            length · spreadMethod other than pad · no drawable geometry left
 *   degrades text, image, use and foreignObject are dropped with a warning as
 *            long as other geometry survives; an unresolved clip path is
 *            ignored; a focal radial gradient is approximated
 *
 * Degradation keeps the SVG. Only a failure earns a raster.
 */

/** Path commands SvgPathParser accepts, in either case. */
const PATH_COMMANDS = /^[MLHVCSQTAZ]$/i;
/** Transforms SvgIconReader composes. Anything else is refused by the reader. */
const SUPPORTED_TRANSFORMS = new Set(["translate", "scale", "rotate", "matrix"]);
/** Units SvgStyles.length parses. Relative units are refused. */
// `\b` after `%` never matches: both sides are non-word characters, so "50%"
// read as absolute. A negative lookahead is the boundary that works for a unit
// ending in a symbol as well as one ending in a letter.
const RELATIVE_UNIT = /\d\s*(?:%|em|ex|rem|vw|vh|vmin|vmax)(?![a-z])/i;
/** Elements lowered to geometry — at least one must survive. */
const GEOMETRY = /<\s*(path|rect|circle|ellipse|line|polyline|polygon)\b/gi;
/** Visible content the reader drops rather than draws. */
const DROPPED = /<\s*(text|tspan|textPath|image|use|foreignObject)\b/gi;

/** Strip comments and CDATA so their contents cannot be mistaken for markup. */
function stripNoise(svg) {
  return svg.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
}

function attributeValues(svg, attribute) {
  const pattern = new RegExp(`\\b${attribute}\\s*=\\s*("([^"]*)"|'([^']*)')`, "gi");
  const values = [];
  for (const match of svg.matchAll(pattern)) values.push(match[2] ?? match[3] ?? "");
  return values;
}

/** A root width/height is only usable when it is unitless or in px. */
function usableRootLength(value) {
  return /^\s*\d*\.?\d+\s*(px)?\s*$/i.test(value ?? "");
}

/**
 * @param {string} svgText
 * @returns {{compatible: boolean, reasons: string[], geometryCount: number, droppedKinds: string[]}}
 */
export function checkSvgCompatibility(svgText) {
  const reasons = [];
  const svg = stripNoise(String(svgText ?? ""));

  if (!/<\s*svg[\s>]/i.test(svg)) {
    return { compatible: false, reasons: ["no <svg> root element"], geometryCount: 0, droppedKinds: [] };
  }
  if (/<!DOCTYPE/i.test(svg)) {
    reasons.push("DOCTYPE is refused (external entities are not reachable)");
  }

  // A frame: viewBox, or a width and height the root parser can read.
  const rootTag = svg.match(/<\s*svg\b[^>]*>/i)?.[0] ?? "";
  const hasViewBox = /\bviewBox\s*=/i.test(rootTag);
  if (!hasViewBox) {
    const width = attributeValues(rootTag, "width")[0];
    const height = attributeValues(rootTag, "height")[0];
    if (!usableRootLength(width) || !usableRootLength(height)) {
      reasons.push("no viewBox, and width/height are missing or carry units the root parser does not read");
    }
  }

  for (const data of attributeValues(svg, "d")) {
    const trimmed = data.trim();
    if (!trimmed) {
      reasons.push("empty path data");
      continue;
    }
    if (!/^[Mm]/.test(trimmed)) {
      reasons.push(`path data must start with a moveto, found "${trimmed.slice(0, 8)}"`);
    }
    for (const command of trimmed.match(/[A-Za-z]/g) ?? []) {
      if (!PATH_COMMANDS.test(command)) {
        reasons.push(`unsupported path command "${command}"`);
        break;
      }
    }
  }

  for (const transform of attributeValues(svg, "transform")) {
    for (const [, fn] of transform.matchAll(/([a-zA-Z]+)\s*\(/g)) {
      if (!SUPPORTED_TRANSFORMS.has(fn)) {
        reasons.push(`unsupported transform "${fn}()"`);
      }
    }
  }

  // Relative units are refused where a length is read — but the root's own
  // width/height are only read when there is no viewBox, and Iconify serves
  // every icon as `width="1em" height="1em" viewBox="0 0 24 24"`. Judging the
  // root by those would rasterise the entire icon set, which is to say it would
  // leave the pipeline exactly as it was.
  const body = hasViewBox ? svg.replace(rootTag, "<svg>") : svg;
  for (const attribute of ["stroke-width", "width", "height", "r", "rx", "ry", "cx", "cy", "x", "y"]) {
    for (const value of attributeValues(body, attribute)) {
      if (RELATIVE_UNIT.test(value)) {
        reasons.push(`relative unit in ${attribute}="${value}"`);
        break;
      }
    }
  }

  for (const value of attributeValues(svg, "spreadMethod")) {
    if (value.trim() !== "pad") {
      reasons.push(`spreadMethod="${value}" — PDF shading maps only "pad"`);
    }
  }

  // A gradient paint that names an id the document does not define is fatal.
  const definedIds = new Set(attributeValues(svg, "id").map((id) => id.trim()));
  for (const paint of [...attributeValues(svg, "fill"), ...attributeValues(svg, "stroke")]) {
    const reference = paint.match(/url\(\s*#([^)\s]+)\s*\)/);
    if (reference && !definedIds.has(reference[1])) {
      reasons.push(`paint references #${reference[1]}, which this document does not define`);
    }
  }

  const geometryCount = [...svg.matchAll(GEOMETRY)].length;
  const droppedKinds = [...new Set([...svg.matchAll(DROPPED)].map((m) => m[1].toLowerCase()))];
  if (geometryCount === 0) {
    reasons.push(
      droppedKinds.length
        ? `no drawable geometry: only ${droppedKinds.join(", ")}, which the reader drops`
        : "no drawable geometry",
    );
  }

  return {
    compatible: reasons.length === 0,
    reasons: [...new Set(reasons)],
    geometryCount,
    droppedKinds,
  };
}
