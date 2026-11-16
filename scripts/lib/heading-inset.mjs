/**
 * scripts/lib/heading-inset.mjs — a section has two left edges, and the body
 * belongs under the second one.
 *
 * ## The run
 *
 * A CV reference sets every main heading as a circled icon, then the title,
 * then a rule. The paragraphs and company names below each heading line up with
 * the **title**, not with the icon. The run measured the icon exactly —
 *
 *     shapeOwnership.main-badge.bounds = { x: 0.313, w: 0.033 }   repeats: 5
 *     regions.summary.bounds           = { x: 0.315, w: 0.65 }
 *
 * — built the heading as `fixed(18.0)` plus `gap(6)`, and then added every
 * paragraph straight to the section with no left inset. Measured from the
 * render: the heading's text sits at x 207.57 and the summary paragraph at
 * 183.57. Twenty-four points, on every section, for eight revisions.
 *
 * ## Why nothing caught it
 *
 * `regions[]` records a box. The icon, the title and the body are all "inside
 * region summary", and two things at different x inside one region are the same
 * thing to a box. The one vocabulary that could have carried it —
 * `shapeOwnership[].padding`, `.gap`, `.contentAlign` — describes a container's
 * own interior, is optional, and was null on all five entries. What the run did
 * record about the relationship was prose: "Prepended to main content section
 * headings", which is true and says nothing about what the body aligns to.
 *
 * And no gate could see it: twenty-four points of horizontal shift spread over
 * dozens of text rows is thin, never the largest mismatch, and the region
 * ranking ranks regions — whose box was right.
 *
 * ## What this asks, and what it refuses to assume
 *
 * A body flush with the icon is a real design. So nothing here asserts that a
 * section must be indented: `regions[].contentLeft` is a MEASUREMENT, and the
 * only thing demanded is that a region which visibly has two left edges states
 * which one its body uses. Absence would otherwise be indistinguishable from
 * not having looked.
 *
 * "Visibly has two left edges" is decided from the measurements already on
 * disk, not from prose: a container attributed to the region, starting at the
 * region's own left edge, and narrow against it. On the corpus that is exactly
 * the heading badge and nothing else.
 *
 * The code check then compares two numbers rather than enforcing a convention —
 * the analysis says the body is indented, and the Java lays it out flush.
 */

/**
 * How close a container's left edge must be to the region's to count as sitting
 * at it, as a fraction of the page. Two tenths of a percent of A4 is 1.2 pt: a
 * measurement that agrees to within a rounded pixel, not a coincidence.
 */
const AT_THE_EDGE = 0.01;

/**
 * How narrow a container must be against its region to read as a marker rather
 * than a surface. A quarter is generous — the badge that prompted this is a
 * twentieth of its region — and generous is right, because being wrong here
 * only ever asks for one more measured number.
 */
const NARROW_SHARE = 4;

/**
 * The regions whose body has somewhere else to start: a container of theirs
 * sits at their left edge and is narrow enough to be a marker.
 *
 * @param {{regions?: Array<object>, shapeOwnership?: Array<object>}} analysis
 * @returns {Array<{region: object, container: object}>}
 */
export function regionsWithLeadingContainer({ regions = [], shapeOwnership = [] }) {
  const byId = new Map((Array.isArray(regions) ? regions : []).filter((r) => r?.id).map((r) => [r.id, r]));
  const found = [];

  for (const container of Array.isArray(shapeOwnership) ? shapeOwnership : []) {
    const region = byId.get(container?.region);
    const box = container?.bounds;
    const regionBox = region?.bounds;
    if (!region || !box || !regionBox) continue;
    if (!Number.isFinite(box.x) || !Number.isFinite(box.w)) continue;
    if (!Number.isFinite(regionBox.x) || !Number.isFinite(regionBox.w)) continue;

    if (Math.abs(box.x - regionBox.x) > AT_THE_EDGE) continue;
    if (box.w > regionBox.w / NARROW_SHARE) continue;
    found.push({ region, container });
  }

  return found;
}

/**
 * Does every region with two left edges say which one its body uses?
 *
 * @param {{regions?: Array<object>, shapeOwnership?: Array<object>}} analysis
 * @returns {{held: string[], checked: number}}
 */
export function auditContentLeft(analysis) {
  const leading = regionsWithLeadingContainer(analysis);
  const held = [];

  for (const { region, container } of leading) {
    if (Number.isFinite(region.contentLeft)) continue;
    const box = container.bounds;
    held.push(
      `"${region.id}" is headed by "${container.container}", which sits at the region's own left edge ` +
        `(${round(box.x)} against ${round(region.bounds.x)}) and is ${round(box.w)} wide against the ` +
        `region's ${round(region.bounds.w)} — so the region has two left edges, the marker's and the ` +
        "text's beside it, and nothing says which one the paragraphs below use. Measure the leftmost " +
        `ink of the BODY and record it as "contentLeft"; write ${round(region.bounds.x)} if the body ` +
        "really does start at the region's own edge",
    );
  }

  return { held, checked: leading.length };
}

/** A row whose first column is a fixed lane: `columns(DocumentRowColumn.fixed(N), …)`. */
const LEADING_FIXED = /\.\s*columns\s*\(\s*DocumentRowColumn\s*\.\s*fixed\s*\(\s*([0-9]+(?:\.[0-9]+)?)\s*[fFdD]?\s*\)/;

/** The gap between a row's columns, when it is a literal. */
const ROW_GAP = /\.\s*gap\s*\(\s*([0-9]+(?:\.[0-9]+)?)\s*[fFdD]?\s*\)/;

/**
 * The LEFT of every `padding(...)` / `margin(...)` in a method body, as written.
 *
 * Testing for the mere presence of such a call was the first version of this,
 * and it was a false negative on the run it was written for: `renderSummary`
 * carried `sec.margin(new DocumentInsets(0, 0, 32.0, 0))` — a bottom margin —
 * and the check went silent on a body still flush against the marker. The
 * fourth argument is the one that moves content rightwards, so the fourth
 * argument is what gets read.
 *
 * Numbers for literals, `null` for anything else — an identifier, a sum, a
 * call. `null` is what a derived constant looks like, and derived is the answer
 * the authoring rules ask for, so it is never reported against.
 *
 * @param {string} body
 * @returns {Array<number|null>}
 */
export function leftInsets(body) {
  const out = [];
  const call = /\.\s*(?:padding|margin)\s*\(/g;
  const text = String(body ?? "");
  let hit;
  while ((hit = call.exec(text)) !== null) {
    const inside = balanced(text, hit.index + hit[0].length - 1);
    if (inside === null) continue;
    const wrapped = /^\s*new\s+DocumentInsets\s*\(([\s\S]*)\)\s*$/.exec(inside);
    const parts = splitTopLevel(wrapped ? wrapped[1] : inside);
    // The four-argument forms are the ones that name a left. `padding(INSETS)`
    // hands over a value from elsewhere: unreadable, and counted as such.
    if (parts.length === 4) {
      const left = parts[3].trim();
      out.push(/^[0-9]+(?:\.[0-9]+)?[fFdD]?$/.test(left) ? Number.parseFloat(left) : null);
    } else if (parts.length === 1 && parts[0].trim() !== "") {
      out.push(null);
    }
  }
  return out;
}

/** The text between `open`'s parenthesis and its match, or null when unbalanced. */
function balanced(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

/** Split on commas that are not nested inside brackets of any kind. */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "<") depth += 1;
    else if (c === ")" || c === "]" || c === ">") depth -= 1;
    else if (c === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Float formatting, not a tolerance anybody chose. Two numbers written in the
 * same file in the same units either agree or they do not; a point of slack is
 * for `20f` against `20.0`.
 */
const SAME_POINT = 1;

/**
 * The inset a heading's title sits at, when a method builds one and says so in
 * literals: the leading fixed lane plus the gap after it.
 *
 * Null when the method builds no such heading, or builds one whose numbers are
 * not literals — a computed lane is a number this cannot read, and reporting a
 * guess about it would be worse than saying nothing.
 *
 * @param {string} body a method body
 * @returns {number|null} points from the section's left edge
 */
export function headingTextInset(body) {
  const lane = LEADING_FIXED.exec(String(body ?? ""));
  if (!lane) return null;
  const gap = ROW_GAP.exec(String(body ?? ""));
  const width = Number(lane[1]);
  if (!Number.isFinite(width)) return null;
  return width + (gap ? Number(gap[1]) || 0 : 0);
}

/**
 * Report a section whose analysis says the body is indented and whose Java lays
 * it flush with the marker.
 *
 * Deliberately one-directional. It fires only when the measurement says the two
 * edges differ, so a design whose body IS flush is never asked to change; and
 * it stays silent whenever the code carries any padding or margin at all,
 * because reading a partial inset as the wrong inset would report a defect
 * against work that had already been done.
 *
 * @param {object} input
 * @param {Array<object>} input.regions measured regions, carrying contentLeft
 * @param {Array<object>} input.shapeOwnership measured containers, for the marker's id
 * @param {Array<object>} input.componentMapping the plan's region -> method map
 * @param {number} input.pageWidthPt the page width the insets are in
 * @param {string} input.source the generated template
 * @param {(source: string, method: string) => string|null} input.readMethod
 * @returns {Array<{kind: string, region: string, method: string|null, detail: string}>}
 */
export function checkHeadingInset({
  regions = [],
  shapeOwnership = [],
  componentMapping = [],
  pageWidthPt = 595.276,
  source = "",
  readMethod,
}) {
  const findings = [];
  const methodFor = new Map();
  for (const entry of Array.isArray(componentMapping) ? componentMapping : []) {
    if (entry?.region && entry.renderMethod) methodFor.set(entry.region, entry.renderMethod);
  }

  // Keyed on the leading container, not on the region alone: the marker's own
  // id is how the heading row is found in the template, and it is the same id
  // the analysis barrier asked the measurement for.
  const markerFor = new Map(
    regionsWithLeadingContainer({ regions, shapeOwnership }).map(({ region, container }) => [
      region.id,
      container.container,
    ]),
  );

  for (const region of Array.isArray(regions) ? regions : []) {
    if (!region?.id || !region.bounds) continue;
    if (!Number.isFinite(region.contentLeft) || !Number.isFinite(region.bounds.x)) continue;
    const declared = (region.contentLeft - region.bounds.x) * pageWidthPt;
    // Under a point is the measurement agreeing with itself, not an indent.
    if (declared < 1) continue;

    const method = methodFor.get(region.id);
    if (!method) continue;
    const body = readMethod(source, method);
    if (body === null) continue;

    // The marker's own row first, because it is the only one certain to be the
    // heading. Then the helpers this method calls, then a row in the method
    // itself — a template that builds its heading inline has nowhere else.
    const marker = markerFor.get(region.id);
    const inset =
      (marker ? headingLaneFor(source, marker) : null) ??
      headingInsetFromHelpers(source, body, readMethod) ??
      headingTextInset(body);
    if (inset === null) continue;

    // What the code actually moves the body by. A derived value reads as null
    // and ends the question: it is the answer the authoring rules ask for, and
    // its arithmetic is not this check's business.
    const written = leftInsets(body);
    if (written.some((value) => value === null)) continue;
    const built = written.reduce((most, value) => Math.max(most, value), 0);

    const measured = `the reference puts "${region.id}"'s body at ${round(region.contentLeft)} of the page ` +
      `and the region starts at ${round(region.bounds.x)} — ${Math.round(declared)} pt in, which is where ` +
      `the heading's title sits, not its marker`;

    if (built < SAME_POINT) {
      findings.push({
        kind: "body-not-under-its-heading",
        region: region.id,
        method,
        detail:
          `${measured}. ${method}() builds that heading with a ${inset} pt lane before the title and then ` +
          "adds its content to the section with no left inset, so every paragraph below lines up with the " +
          "icon instead of the words. Inset the body by the same derived amount — one constant, the lane " +
          "plus the gap — rather than by a typed number",
      });
      continue;
    }

    // Both numbers are in this one file, in points, with no rasterisation
    // between them: the lane the heading builds is exactly where the title
    // starts, and the body is meant to start there too. So they are compared
    // against each other rather than against the measurement, which only had to
    // say that the two edges differ at all.
    if (Math.abs(built - inset) > SAME_POINT) {
      findings.push({
        kind: "body-inset-is-not-the-heading-lane",
        region: region.id,
        method,
        detail:
          `${measured}. ${method}() builds the heading with a ${inset} pt lane before the title and insets ` +
          `its body by ${built} pt, so the two are ${round(Math.abs(built - inset))} pt apart and the ` +
          "paragraphs sit under neither the icon nor the words. The lane and the inset are one quantity: " +
          "name it once in baseConstants as the lane plus the gap and use it in both places, so a change " +
          "to the badge cannot leave the body behind",
      });
    }
  }

  return findings;
}

/**
 * The lane in front of the row that holds THIS marker, wherever it is written.
 *
 * Reading the first `columns(fixed(N))` in the region's own method was wrong
 * twice on the run this was built against: `renderAchievements` and
 * `renderAdditionalInfo` each build an item row before their heading, so the
 * check quoted 24 and 22 pt for headings that are 25. The finding survived
 * either way, and a finding that quotes a number nobody can reproduce is worth
 * less than one that quotes none.
 *
 * The analysis already names the marker — it is the container the barrier keyed
 * on — and the template names it back, so the row is found by walking from that
 * name to the `columns(...)` that opened it. Null when the name is absent from
 * the source, or the numbers are not literals.
 *
 * @param {string} source the whole template
 * @param {string} container the marker's id, from shapeOwnership
 * @returns {number|null} points from the row's left edge to its second column
 */
export function headingLaneFor(source, container) {
  const text = String(source ?? "");
  const quoted = `"${container}"`;
  let at = text.indexOf(quoted);
  while (at !== -1) {
    const opened = text.lastIndexOf(".columns(", at);
    if (opened !== -1) {
      const lane = LEADING_FIXED.exec(text.slice(opened, at));
      const gap = ROW_GAP.exec(text.slice(opened, at));
      if (lane) {
        const width = Number(lane[1]);
        if (Number.isFinite(width)) return width + (gap ? Number(gap[1]) || 0 : 0);
      }
    }
    at = text.indexOf(quoted, at + quoted.length);
  }
  return null;
}

/**
 * The heading inset of the helpers a method calls, when one of them builds a
 * heading. Sections in the corpus share one `renderSectionHeader`, so the row
 * this reads is usually not in the method that owns the region.
 */
function headingInsetFromHelpers(source, body, readMethod) {
  // Calls of the shape `renderSomething(sec, …)` — a helper handed a builder.
  const calls = String(body).matchAll(/\b([a-z][A-Za-z0-9_]*)\s*\(\s*[A-Za-z_][A-Za-z0-9_]*\s*,/g);
  const seen = new Set();
  for (const [, name] of calls) {
    if (seen.has(name)) continue;
    seen.add(name);
    const helper = readMethod(source, name);
    if (helper === null) continue;
    const inset = headingTextInset(helper);
    if (inset !== null) return inset;
  }
  return null;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
