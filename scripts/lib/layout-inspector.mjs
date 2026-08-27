/**
 * scripts/lib/layout-inspector.mjs — where did this node end up, and why there?
 *
 * `layout-snapshot.json` is GraphCompose's own post-layout measurement: 248
 * nodes for a one-page CV, every one of them carrying a placement box, insets
 * and a page range. It is the file that ended the guessing — before it existed,
 * "the Languages block is too far right" was answered by looking at a PNG and
 * reasoning backwards about which of four nested paddings had moved.
 *
 * It is also 227 KB, which makes reading it into a model's context the wrong
 * move twice over: it costs the whole budget, and it hands over 247 rows to
 * find the one that matters. So nothing here ever returns the snapshot. It
 * answers two questions about one node:
 *
 *   inspect  where is it — placement box, computed content box, insets, page
 *   explain  why is it there — the additive chain that produces one coordinate
 *
 * ## The chain is the product
 *
 * `HeadingText_CONTACT.x = 26` is a fact a reader can get by grepping. What
 * they cannot get is *whose* number it is:
 *
 *     canvas.margin.left               0
 *   + Sidebar.padding.left            17
 *   + Heading_CONTACT.padding.left     9
 *   = 26
 *
 * Two owners, named, with the amount each contributes. That is the answer to
 * "who owns this offset", and it is what makes a fix land on the node that
 * caused the problem instead of the node that shows it.
 *
 * ## What the snapshot does not contain, and why that shapes everything here
 *
 * The snapshot is a projection of the engine's read model, not a schema this
 * repository designed, so several things a layout has are simply not in it.
 * Each absence was measured over all 248 nodes of the reference document before
 * being worked around:
 *
 * - **No `spacing`, no layout direction.** Direction is inferred from sibling
 *   geometry — children sharing a top edge and differing in x are a row — with
 *   `entityKind === "RowNode"` as corroboration. Spacing can only ever surface
 *   as a residual.
 * - **`contentWidth` is not the content box.** Despite the field name and the
 *   schema's own description, `contentWidth === placementWidth` on all 248
 *   nodes: `Sidebar` is 190.31 wide with 17 of padding on each side and reports
 *   `contentWidth` 190.31. The box the children actually sit in has to be
 *   computed — and it is 156.31, which is exactly where `Align` starts. Reading
 *   the field would be wrong by the padding, silently, on every node that has
 *   any. `contentBoxOf` computes; nothing here reads `contentWidth`.
 * - **`y` is bottom-up.** `Sidebar` reports y 44.209 and is at the *top* of the
 *   page: its top edge is 44.209 + 797.68 = 841.889, one page height. Siblings
 *   flow toward decreasing y. Every vertical rule here works in top edges and
 *   converts at the end, because a chain that reads "+ margin.top" while the
 *   number goes down is a chain nobody can check.
 * - **`computedX === placementX`, `computedY === placementY`** on all 248
 *   nodes. Placement is reported; the pair is not presented as two facts.
 *
 * ## It must be able to say "I cannot derive this"
 *
 * 109 of 247 non-root nodes have a width no arithmetic over this file
 * recovers — a paragraph is as wide as its text, and the text metrics are not
 * here. 16 have an x that matches no rule: `LanguageLevel_0..3` all start at
 * 73.271 no matter how wide their siblings are, which is a weighted row column,
 * and weights are not in the file either.
 *
 * So `explain` reports `derivable: false` and says what it would take, rather
 * than assembling a chain that happens to add up. A tool that always produces
 * an answer is guessing with extra steps, which is the behaviour this exists to
 * replace. Where a chain *is* produced, its residual is an explicit named term
 * and `exact` is a hard boolean — an unattributed gap is the finding, not
 * something to absorb quietly into the last term.
 *
 * No model is called from any path in this file.
 */

/**
 * Floats are normalised to three decimals when the snapshot is written, so a
 * four-term chain can drift by up to 0.002 without anything being wrong. Every
 * comparison here goes through `near`; none uses `===`.
 */
export const EPSILON = 0.002;

/** The six coordinates `explain` answers for. */
export const COORDINATES = Object.freeze(["x", "y", "width", "height", "contentX", "contentY"]);

/** The file is not a layout snapshot, or is one this cannot read. */
export class LayoutSnapshotError extends Error {
  constructor(message) {
    super(message);
    this.name = "LayoutSnapshotError";
  }
}

/** No such node, or a name that names more than one. */
export class NodeQueryError extends Error {
  constructor(message, candidates = []) {
    super(message);
    this.name = "NodeQueryError";
    this.candidates = candidates;
  }
}

const near = (a, b) => Math.abs(a - b) <= EPSILON;

/** Round for display only. Comparisons use `near`, never a rounded value. */
const round = (n) => Math.round(n * 1000) / 1000;

/** The word a user would say for this node. */
export const labelOf = (node) => node.entityName ?? `<${node.entityKind}>`;

/** Top edge. The snapshot is bottom-up, so this is `y + height`, not `y`. */
export const topOf = (node) => node.placementY + node.placementHeight;

/** Right edge. */
export const rightOf = (node) => node.placementX + node.placementWidth;

/**
 * The box this node's children actually sit in: placement, inset by padding.
 *
 * Computed rather than read. See the header — `contentWidth` in the file is
 * equal to `placementWidth` on every node measured, so reading it would return
 * the padding-inclusive width under a name that promises otherwise.
 */
export function contentBoxOf(node) {
  return {
    x: node.placementX + node.padding.left,
    y: node.placementY + node.padding.bottom,
    width: node.placementWidth - node.padding.left - node.padding.right,
    height: node.placementHeight - node.padding.top - node.padding.bottom,
    top: node.placementY + node.placementHeight - node.padding.top,
  };
}

const INSET_KEYS = ["top", "right", "bottom", "left"];

function requireInsets(value, where) {
  if (!value || typeof value !== "object") throw new LayoutSnapshotError(`${where} is missing`);
  for (const key of INSET_KEYS) {
    if (typeof value[key] !== "number") throw new LayoutSnapshotError(`${where}.${key} is not a number`);
  }
}

/**
 * Read a parsed snapshot into a queryable model.
 *
 * Strict on the fields every rule below depends on, because the alternative is
 * a chain built from `undefined` that renders as `NaN` three lines later. Five
 * files in this repository's own examples are `layout-snapshot.json` documents
 * with no `nodes` array at all — illustrative material written before the real
 * writer existed — so "it parsed as JSON" is not evidence of anything.
 *
 * @param {unknown} file parsed JSON — the 2.2.2+ envelope or a pre-2.2.2 flat snapshot
 * @returns {object} model with `byPath`, `children` and `roots` indexes
 */
export function loadSnapshot(file) {
  if (!file || typeof file !== "object" || Array.isArray(file)) {
    throw new LayoutSnapshotError("not a JSON object");
  }

  // Two shapes reach this, and both are legitimate.
  //
  // GraphCompose 2.2.2 made the extra diagnostic sections opt-in and returns
  // them in an ENVELOPE — `{formatVersion, layout, typography}` — so that
  // `layoutSnapshot()` keeps returning byte-for-byte what it always returned
  // and nobody's committed baseline moves on a library upgrade. The renderer
  // asks for the envelope, so that is what a fresh revision folder holds.
  //
  // Every revision rendered before that holds the plain snapshot at the top
  // level. Those are real measurements and stay readable: refusing them would
  // throw away the only history this repository has.
  const envelope = file.layout && typeof file.layout === "object" && !Array.isArray(file.layout);
  const data = envelope ? file.layout : file;
  const typographyFrom = envelope ? file.typography : file.typography;

  if (!Array.isArray(data.nodes)) {
    throw new LayoutSnapshotError(
      "no `nodes` array — this is not an engine-written layout snapshot " +
        "(illustrative snapshots predating the renderer have this shape)",
    );
  }
  if (!data.canvas || typeof data.canvas !== "object") throw new LayoutSnapshotError("no `canvas`");
  requireInsets(data.canvas.margin, "canvas.margin");

  const byPath = new Map();
  const children = new Map();
  const roots = [];
  const typographyByPath = new Map();

  for (const node of data.nodes) {
    if (!node || typeof node.path !== "string" || node.path === "") {
      throw new LayoutSnapshotError("a node has no `path`");
    }
    if (byPath.has(node.path)) throw new LayoutSnapshotError(`duplicate node path: ${node.path}`);
    for (const key of ["placementX", "placementY", "placementWidth", "placementHeight"]) {
      if (typeof node[key] !== "number") throw new LayoutSnapshotError(`${node.path}.${key} is not a number`);
    }
    requireInsets(node.margin, `${node.path}.margin`);
    requireInsets(node.padding, `${node.path}.padding`);
    byPath.set(node.path, node);
  }

  for (const node of data.nodes) {
    if (node.parentPath == null) {
      roots.push(node);
      continue;
    }
    if (!byPath.has(node.parentPath)) {
      throw new LayoutSnapshotError(`${node.path} names a parent that is not in the file: ${node.parentPath}`);
    }
    const siblings = children.get(node.parentPath);
    if (siblings) siblings.push(node);
    else children.set(node.parentPath, [node]);
  }
  for (const siblings of children.values()) {
    siblings.sort((a, b) => (a.childIndex ?? 0) - (b.childIndex ?? 0));
  }

  // Optional, and its absence is ordinary rather than a defect: GraphCompose only
  // began reporting it in 2.2.2, so every revision rendered before that has none.
  // Keyed by owning node path — a paragraph split across pages contributes one run
  // per page, which is why the value is a list.
  for (const run of Array.isArray(typographyFrom) ? typographyFrom : []) {
    if (!run || typeof run.path !== "string") continue;
    const runs = typographyByPath.get(run.path);
    if (runs) runs.push(run);
    else typographyByPath.set(run.path, [run]);
  }
  for (const runs of typographyByPath.values()) {
    runs.sort((a, b) => (a.fragmentIndex ?? 0) - (b.fragmentIndex ?? 0));
  }

  return {
    formatVersion: data.formatVersion ?? null,
    // The envelope carries its own version, and it moves on a different
    // schedule from the layout's: a new diagnostic section bumps one and not
    // the other. Null for a pre-2.2.2 render, which had no envelope.
    diagnosticFormatVersion: envelope ? file.formatVersion ?? null : null,
    canvas: data.canvas,
    totalPages: data.totalPages ?? null,
    capturedAt: data.capturedAt ?? null,
    graphComposeVersion: data.graphComposeVersion ?? null,
    nodes: data.nodes,
    byPath,
    children,
    roots,
    typography: Array.isArray(typographyFrom) ? typographyFrom : [],
    typographyByPath,
    hasTypography: typographyByPath.size > 0,
  };
}

/**
 * The text runs this node drew, or an empty list.
 *
 * Empty means two different things and the caller has to keep them apart: the node
 * draws no text, or the render predates GraphCompose 2.2.2 and the snapshot carries
 * no typography at all. `model.hasTypography` separates them.
 */
export const typographyOf = (model, node) => model.typographyByPath.get(node.path) ?? [];

/**
 * Every text run under a node, itself included.
 *
 * A region's owner is usually a section, and the text is in its descendants — so a
 * question about "the font in this block" is a question about the subtree.
 */
export function typographyUnder(model, node) {
  const found = [];
  const walk = (current) => {
    found.push(...typographyOf(model, current));
    for (const child of childrenOf(model, current)) walk(child);
  };
  walk(node);
  return found;
}

/** Children of a node, in author order. Never null. */
export const childrenOf = (model, node) => model.children.get(node.path) ?? [];

/** Parent, or null at a root. */
export const parentOf = (model, node) => (node.parentPath == null ? null : model.byPath.get(node.parentPath) ?? null);

/** Root → … → node, excluding the node itself. */
export function ancestorsOf(model, node) {
  const chain = [];
  for (let cursor = parentOf(model, node); cursor; cursor = parentOf(model, cursor)) chain.unshift(cursor);
  return chain;
}

/** Preceding sibling, or null when this is the first child. */
export function previousSiblingOf(model, node) {
  const parent = parentOf(model, node);
  if (!parent) return null;
  const siblings = childrenOf(model, parent);
  const at = siblings.indexOf(node);
  return at > 0 ? siblings[at - 1] : null;
}

/**
 * Does this node lay its children out horizontally?
 *
 * The snapshot carries no direction, so this is inferred: children that share a
 * top edge but not an x are side by side. `RowNode` is taken at its word first
 * — two `RowNode`s in the reference document hold a single child, where sibling
 * geometry can say nothing at all.
 */
export function isRowParent(model, node) {
  if (node.entityKind === "RowNode") return true;
  const kids = childrenOf(model, node);
  if (kids.length < 2) return false;
  const sameTop = kids.every((k) => near(topOf(k), topOf(kids[0])));
  const sameX = kids.every((k) => near(k.placementX, kids[0].placementX));
  return sameTop && !sameX;
}

// ------------------------------------------------------------ node lookup ---

/**
 * Find the node the caller means.
 *
 * A user says "Languages", not
 * `CharcoalGoldCv[0]/Body[0]/Sidebar[0]/Languages[5]`, and a tool that only
 * accepts the second is a tool they have to read the snapshot to use — which is
 * the thing this exists to avoid. Four strategies, most specific first; an
 * ambiguous name fails with its candidates rather than picking one, because
 * silently answering about the wrong `SvgIcon` is worse than not answering.
 *
 * @param {object} model
 * @param {string} selector full path, entity name, or a unique path suffix
 * @returns {object} the node
 */
export function resolveNode(model, selector) {
  if (typeof selector !== "string" || selector.trim() === "") {
    throw new NodeQueryError("no node given");
  }
  const wanted = selector.trim();

  const exactPath = model.byPath.get(wanted);
  if (exactPath) return exactPath;

  const byName = model.nodes.filter((n) => n.entityName === wanted);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) throw ambiguous(wanted, byName, "name");

  const suffix = model.nodes.filter((n) => n.path === wanted || n.path.endsWith(`/${wanted}`));
  if (suffix.length === 1) return suffix[0];
  if (suffix.length > 1) throw ambiguous(wanted, suffix, "path suffix");

  const lower = wanted.toLowerCase();
  const insensitive = model.nodes.filter((n) => (n.entityName ?? "").toLowerCase() === lower);
  if (insensitive.length === 1) return insensitive[0];
  if (insensitive.length > 1) throw ambiguous(wanted, insensitive, "name");

  const nearby = model.nodes
    .filter((n) => (n.entityName ?? "").toLowerCase().includes(lower) || n.path.toLowerCase().includes(lower))
    .slice(0, 10);
  throw new NodeQueryError(
    `no node named ${JSON.stringify(wanted)}` + (nearby.length ? " — did you mean one of these?" : ""),
    nearby.map((n) => n.path),
  );
}

function ambiguous(wanted, matches, kind) {
  return new NodeQueryError(
    `${JSON.stringify(wanted)} matches ${matches.length} nodes by ${kind} — name one by its full path`,
    matches.map((n) => n.path),
  );
}

// ---------------------------------------------------------------- inspect ---

/**
 * Everything about one node, and nothing about any other — except the parent's
 * identity and the child count, which are what a caller needs to decide where
 * to look next.
 *
 * Pages are reported one-based for a human and left zero-based in the JSON,
 * which is what the file holds. A node that spans pages reports a range: the
 * engine's layout model has one placement box for the whole node, so there is
 * no per-page box to hand back and pretending otherwise would invent geometry.
 */
export function inspectNode(model, node, { children = false, ancestors = false } = {}) {
  const parent = parentOf(model, node);
  const kids = childrenOf(model, node);
  const content = contentBoxOf(node);
  const brief = (n) => ({
    path: n.path,
    name: n.entityName,
    kind: n.entityKind,
    x: round(n.placementX),
    y: round(n.placementY),
    width: round(n.placementWidth),
    height: round(n.placementHeight),
  });

  return {
    path: node.path,
    name: node.entityName,
    kind: node.entityKind,
    depth: node.depth,
    layer: node.layer,
    childIndex: node.childIndex,
    parent: parent ? { path: parent.path, name: parent.entityName, kind: parent.entityKind } : null,
    siblingCount: parent ? childrenOf(model, parent).length : model.roots.length,
    childCount: kids.length,
    laysOutAs: kids.length ? (isRowParent(model, node) ? "row" : "column") : null,
    placement: {
      x: round(node.placementX),
      y: round(node.placementY),
      width: round(node.placementWidth),
      height: round(node.placementHeight),
      top: round(topOf(node)),
      right: round(rightOf(node)),
    },
    content: {
      x: round(content.x),
      y: round(content.y),
      width: round(content.width),
      height: round(content.height),
      top: round(content.top),
      computed: true,
    },
    margin: node.margin,
    padding: node.padding,
    pages: { start: node.startPage, end: node.endPage, spansPages: node.startPage !== node.endPage },
    // Present only when the render produced it. A node with no entry either draws
    // no text or predates the engine that reports it; `model.hasTypography` is what
    // separates those, and a caller that conflates them will read "no font problem"
    // off a snapshot that never looked.
    ...(typographyOf(model, node).length
      ? {
          typography: typographyOf(model, node).map((run) => ({
            fragmentIndex: run.fragmentIndex,
            page: run.page,
            declaredFont: run.declaredFont,
            // Family and decoration together select the face. Reporting only the
            // family makes `Helvetica + DEFAULT` and `Helvetica + BOLD` look
            // identical here while rendering and measuring as different faces.
            resolvedFamily: run.resolvedFamily,
            decoration: run.decoration,
            fontSubstituted: run.fontSubstituted,
            fontSize: run.fontSize,
            lineCount: run.lineCount,
            verticalAlign: run.verticalAlign,
          })),
        }
      : {}),
    ...(children ? { children: kids.map(brief) } : {}),
    ...(ancestors ? { ancestors: ancestorsOf(model, node).map(brief) } : {}),
  };
}

// ---------------------------------------------------------------- explain ---

const term = (label, value) => ({ label, value: round(value) });

const sum = (terms) => terms.reduce((total, t) => total + t.value, 0);

/** Drop the zero addends, keep the base term — a chain of `+ 0`s reads as noise. */
const trim = (terms) => (terms.length ? [terms[0], ...terms.slice(1).filter((t) => t.value !== 0)] : terms);

/**
 * The chain that grounds this node's x, expanded through however many ancestors
 * contribute.
 *
 * Recursion stops at a node whose own x is not flow-derived — a centred or
 * right-aligned ancestor becomes a single leaf term rather than a fabricated
 * chain of insets that happens to sum correctly.
 *
 * Callers ground a *child* by expanding its parent, never by expanding the node
 * itself. Expanding the node returns `[TheNode.x = 73.271]` when no rule
 * explains it, which sums to the right answer and explains nothing — a
 * tautology that would have reported the sixteen weighted row columns in the
 * reference document as exactly derived.
 */
function groundedXTerms(model, node) {
  const parent = parentOf(model, node);
  if (!parent) {
    const margin = model.canvas.margin.left;
    return near(node.placementX, margin)
      ? [term("canvas.margin.left", margin)]
      : [term(`${labelOf(node)}.x`, node.placementX)];
  }
  const box = contentBoxOf(parent);
  if (!near(node.placementX, box.x + node.margin.left)) {
    return [term(`${labelOf(node)}.x`, node.placementX)];
  }
  return [
    ...groundedXTerms(model, parent),
    term(`${labelOf(parent)}.padding.left`, parent.padding.left),
    term(`${labelOf(node)}.margin.left`, node.margin.left),
  ];
}

/** The same, upward through top edges, with the same grounding rule. */
function groundedTopTerms(model, node) {
  const parent = parentOf(model, node);
  if (!parent) {
    const top = model.canvas.pageHeight - model.canvas.margin.top;
    return near(topOf(node), top)
      ? [term("canvas.pageHeight", model.canvas.pageHeight), term("canvas.margin.top", -model.canvas.margin.top)]
      : [term(`${labelOf(node)}.top`, topOf(node))];
  }
  const box = contentBoxOf(parent);
  if (!near(topOf(node), box.top - node.margin.top)) {
    return [term(`${labelOf(node)}.top`, topOf(node))];
  }
  return [
    ...groundedTopTerms(model, parent),
    term(`${labelOf(parent)}.padding.top`, -parent.padding.top),
    term(`${labelOf(node)}.margin.top`, -node.margin.top),
  ];
}

function candidateXRules(model, node, parent) {
  const box = contentBoxOf(parent);
  const previous = previousSiblingOf(model, node);
  const rules = [];

  if (previous && isRowParent(model, parent)) {
    rules.push({
      rule: "rowFlow",
      terms: [
        term(`${labelOf(previous)}.x`, previous.placementX),
        term(`${labelOf(previous)}.width`, previous.placementWidth),
        term(`${labelOf(node)}.margin.left`, node.margin.left),
      ],
      note: "placed after the preceding column of the row",
    });
  }
  rules.push({
    rule: "flowStart",
    terms: [
      ...groundedXTerms(model, parent),
      term(`${labelOf(parent)}.padding.left`, parent.padding.left),
      term(`${labelOf(node)}.margin.left`, node.margin.left),
    ],
    note: "starts at the parent content box",
  });
  rules.push({
    rule: "centred",
    terms: [
      term(`${labelOf(parent)}.contentX`, box.x),
      term("(parent.contentWidth - width) / 2", (box.width - node.placementWidth) / 2),
    ],
    note: "centred in the parent content box",
  });
  rules.push({
    rule: "rightAligned",
    terms: [
      term(`${labelOf(parent)}.contentX`, box.x),
      term(`${labelOf(parent)}.contentWidth`, box.width),
      term(`${labelOf(node)}.width`, -node.placementWidth),
      term(`${labelOf(node)}.margin.right`, -node.margin.right),
    ],
    note: "right edge aligned to the parent content box",
  });
  return rules;
}

function candidateYRules(model, node, parent) {
  const box = contentBoxOf(parent);
  const previous = previousSiblingOf(model, node);
  const height = term(`${labelOf(node)}.height`, -node.placementHeight);
  const rules = [];

  if (previous && !isRowParent(model, parent)) {
    rules.push({
      rule: "flowAfterSibling",
      terms: [
        term(`${labelOf(previous)}.y`, previous.placementY),
        term(`${labelOf(previous)}.margin.bottom`, -previous.margin.bottom),
        term(`${labelOf(node)}.margin.top`, -node.margin.top),
        height,
      ],
      note: "stacked under the preceding sibling — y decreases down the page",
    });
  }
  rules.push({
    rule: "contentTop",
    terms: [
      ...groundedTopTerms(model, parent),
      term(`${labelOf(parent)}.padding.top`, -parent.padding.top),
      term(`${labelOf(node)}.margin.top`, -node.margin.top),
      height,
    ],
    note: "top edge sits at the parent content top",
  });
  rules.push({
    rule: "verticallyCentred",
    terms: [
      term(`${labelOf(parent)}.y`, parent.placementY),
      term("(parent.height - height) / 2", (parent.placementHeight - node.placementHeight) / 2),
    ],
    note: "centred vertically in the parent",
  });
  return rules;
}

/**
 * Try each candidate in order and return the first that lands on the measured
 * value. Nothing matching is a result, not an error — the caller reports the
 * residual against the most plausible rule rather than inventing a term to
 * close the gap.
 */
function pick(rules, actual) {
  for (const candidate of rules) {
    const terms = trim(candidate.terms);
    if (near(sum(terms), actual)) return { ...candidate, terms, exact: true, residual: 0 };
  }
  const fallback = rules[0];
  const terms = trim(fallback.terms);
  return { ...fallback, terms, exact: false, residual: round(actual - sum(terms)) };
}

function unattributed(result, node, parent, kind) {
  if (result.exact) return result;
  const box = contentBoxOf(parent);
  const fraction = box.width > 0 ? (node.placementX - box.x) / box.width : null;
  return {
    ...result,
    note:
      kind === "x"
        ? `${result.note}, but ${result.residual} is unaccounted for. Nothing in the snapshot ` +
          `attributes it: a weighted row column is the usual cause` +
          (fraction === null ? "" : ` (this node starts at ${round(fraction * 100)}% of the parent content width)`) +
          ", and weights are not recorded."
        : `${result.note}, but ${result.residual} is unaccounted for — parent spacing or an ` +
          "unrecorded offset. The snapshot carries no spacing, so this gap is exactly the amount " +
          "no node has claimed.",
  };
}

function explainWidth(model, node) {
  const parent = parentOf(model, node);
  if (!parent) {
    return exact("width", node.placementWidth, "canvas", [term("canvas.innerWidth", model.canvas.innerWidth)], "the page content width");
  }
  const box = contentBoxOf(parent);
  const terms = trim([
    term(`${labelOf(parent)}.width`, parent.placementWidth),
    term(`${labelOf(parent)}.padding.left`, -parent.padding.left),
    term(`${labelOf(parent)}.padding.right`, -parent.padding.right),
    term(`${labelOf(node)}.margin.left`, -node.margin.left),
    term(`${labelOf(node)}.margin.right`, -node.margin.right),
  ]);
  if (near(sum(terms), node.placementWidth)) {
    return {
      coordinate: "width",
      value: round(node.placementWidth),
      rule: "fillsParentContent",
      derivable: true,
      exact: true,
      residual: 0,
      terms,
      note: "fills the parent content box, less its own horizontal margins",
    };
  }
  const share = box.width > 0 ? round((node.placementWidth / box.width) * 100) : null;
  return {
    coordinate: "width",
    value: round(node.placementWidth),
    rule: "intrinsic",
    derivable: false,
    exact: false,
    residual: null,
    terms: [],
    note:
      "measured from content — text metrics, an image's own size, or a weighted row column. " +
      "No arithmetic over this snapshot produces it: the metrics that decide it are not in the file. " +
      (share === null ? "" : `It occupies ${share}% of the parent content width. `) +
      "Typography lands in Phase 17; a width that should be relational is a template fix, not a query.",
  };
}

function explainHeight(model, node) {
  const kids = childrenOf(model, node);
  if (kids.length === 0) {
    return {
      coordinate: "height",
      value: round(node.placementHeight),
      rule: "intrinsic",
      derivable: false,
      exact: false,
      residual: null,
      terms: [],
      note:
        "a leaf node is as tall as what it draws — line count, font metrics, or an image's own size. " +
        "The snapshot records the result, not the metrics that produced it.",
    };
  }
  const row = isRowParent(model, node);
  const outer = (k) => k.placementHeight + k.margin.top + k.margin.bottom;
  const contributing = row ? [kids.reduce((tallest, k) => (outer(k) > outer(tallest) ? k : tallest), kids[0])] : kids;
  const terms = trim([
    term(`${labelOf(node)}.padding.top`, node.padding.top),
    ...contributing.map((k) => term(`${labelOf(k)} height + margins`, outer(k))),
    term(`${labelOf(node)}.padding.bottom`, node.padding.bottom),
  ]);
  const total = sum(terms);
  return {
    coordinate: "height",
    value: round(node.placementHeight),
    rule: row ? "tallestChildPlusPadding" : "childrenPlusPadding",
    derivable: true,
    exact: near(total, node.placementHeight),
    residual: round(node.placementHeight - total),
    terms,
    note: row
      ? "a row is as tall as its tallest column, plus its own vertical padding"
      : "a container is as tall as its children stacked, plus its own vertical padding",
  };
}

function exact(coordinate, value, rule, terms, note) {
  const trimmed = trim(terms);
  return {
    coordinate,
    value: round(value),
    rule,
    derivable: true,
    exact: near(sum(trimmed), value),
    residual: round(value - sum(trimmed)),
    terms: trimmed,
    note,
  };
}

/**
 * Why is this node's `coordinate` the number it is?
 *
 * @param {object} model
 * @param {object} node
 * @param {"x"|"y"|"width"|"height"|"contentX"|"contentY"} coordinate
 * @returns {object} `{coordinate, value, rule, derivable, exact, residual, terms, note}`
 */
export function explain(model, node, coordinate) {
  if (!COORDINATES.includes(coordinate)) {
    throw new NodeQueryError(`unknown coordinate ${JSON.stringify(coordinate)} — expected one of ${COORDINATES.join(", ")}`);
  }
  const parent = parentOf(model, node);

  if (coordinate === "width") return explainWidth(model, node);
  if (coordinate === "height") return explainHeight(model, node);

  if (coordinate === "contentX") {
    const base = explain(model, node, "x");
    return {
      ...base,
      coordinate: "contentX",
      value: round(contentBoxOf(node).x),
      terms: trim([...base.terms, term(`${labelOf(node)}.padding.left`, node.padding.left)]),
      note: `${base.note}; the content box then starts one padding.left further in`,
    };
  }
  if (coordinate === "contentY") {
    const base = explain(model, node, "y");
    return {
      ...base,
      coordinate: "contentY",
      value: round(contentBoxOf(node).y),
      terms: trim([...base.terms, term(`${labelOf(node)}.padding.bottom`, node.padding.bottom)]),
      note: `${base.note}; the content box bottom sits one padding.bottom above`,
    };
  }

  if (!parent) {
    return coordinate === "x"
      ? exact("x", node.placementX, "pageOrigin", groundedXTerms(model, node), "the root node starts at the page origin")
      : exact("y", node.placementY, "pageOrigin", [...groundedTopTerms(model, node), term(`${labelOf(node)}.height`, -node.placementHeight)], "the root node's top edge is the page top");
  }

  const actual = coordinate === "x" ? node.placementX : node.placementY;
  const rules = coordinate === "x" ? candidateXRules(model, node, parent) : candidateYRules(model, node, parent);
  const picked = unattributed(pick(rules, actual), node, parent, coordinate);
  return {
    coordinate,
    value: round(actual),
    rule: picked.exact ? picked.rule : `${picked.rule}+unattributed`,
    derivable: true,
    exact: picked.exact,
    residual: picked.residual,
    terms: picked.terms,
    note: picked.note,
  };
}

// --------------------------------------------------------------- coverage ---

/**
 * Classify every node by the rule that explains it, per coordinate.
 *
 * This is what keeps the rule catalogue honest. The counts were measured before
 * the rules were written, and a test pins them: a later change that quietly
 * stops explaining forty nodes turns a test red instead of degrading into the
 * guessing this replaced. Phase 15 reads it too — a diff wants to know whether
 * a moved node was ever derivable before it reports what moved it.
 */
export function classify(model) {
  const counts = { x: {}, y: {}, width: {}, height: {} };
  const bump = (coordinate, key) => {
    counts[coordinate][key] = (counts[coordinate][key] ?? 0) + 1;
  };
  for (const node of model.nodes) {
    if (node.parentPath == null) continue;
    for (const coordinate of ["x", "y", "width", "height"]) {
      const result = explain(model, node, coordinate);
      if (!result.derivable) bump(coordinate, "intrinsic");
      else if (!result.exact) bump(coordinate, "unresolved");
      else bump(coordinate, result.rule);
    }
  }
  return counts;
}
