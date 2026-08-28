/**
 * scripts/lib/structural-smells.mjs — is the geometry in the right place?
 *
 * A template can be pixel-perfect and still be built wrong. Three siblings each
 * carrying `margin(0, 0, 5, 0)` render exactly like one parent carrying
 * `spacing(5)`, and the diff between them is zero — but the first is three
 * numbers a later revision has to find and move together, and the fourth item
 * somebody adds will not have the margin. That is not a rendering defect; it is
 * a maintainability defect, and it is invisible to every gate the loop has.
 *
 * So this reads the source rather than the render. It reports where geometry
 * sits on children that belongs on their parent, where a hand-assembled
 * construction stands in for a primitive the pinned pack has, and where one
 * small region has accumulated more independent constants than a layout needs.
 *
 * ## Calibrated against the corpus, not against an assumption
 *
 * The rule these checks come from assumed the corpus was full of "three
 * siblings with `margin-left = 18`". A census of 862 `margin`/`padding` calls
 * across 35 generated and published templates says otherwise, and two of its
 * findings are wired into the thresholds here:
 *
 * - **Nothing repeats a shared inset three or more times.** The pattern is real
 *   at *two*, so that is the threshold. A rule that only fired at three would
 *   have found nothing in the whole repository.
 * - **21 groups repeat `DocumentInsets.zero()` three or more times**, and every
 *   one of them is neutralising a default rather than stating shared geometry.
 *   Flagging those would have produced 21 false positives on the first run,
 *   which is how a check gets turned off. Zero insets are excluded.
 *
 * Five of the seven real instances are a *single-edge trailing margin* used as
 * an inter-item gap — exactly what `spacing(...)` is for — so that case is
 * reported with the specific fix rather than the generic one.
 *
 * ## And one question that is not about geometry
 *
 * Whether the template can be *published* as a project rather than as one file
 * is asked here too, for the same reason: it is a property of the source that no
 * render can show, and the place to answer it is the loop, not the moment
 * someone says "approve".
 *
 * Evidence, not a build failure. The caller exits 0 either way.
 */

import { classify } from "./bundle-split.mjs";
import { methodBody } from "./region-primitives.mjs";

/**
 * Every `.margin(...)` / `.padding(...)` call, with its argument text.
 *
 * Brace-matched rather than regex-captured. A lazy regex stopped at the first
 * `)` followed by punctuation, which for `.margin(new DocumentInsets(0, 0, 5,
 * 0))` inside a lambda captured one paren too many — harmless for grouping,
 * because it is wrong identically every time, but it defeats any attempt to
 * read which edges the inset actually sets.
 *
 * @returns {Array<{kind: string, args: string}>}
 */
export function insetCalls(body) {
  const out = [];
  const start = /\.(margin|padding)\s*\(/g;
  let hit;
  while ((hit = start.exec(body)) !== null) {
    let depth = 1;
    let i = hit.index + hit[0].length;
    for (; i < body.length && depth > 0; i += 1) {
      if (body[i] === "(") depth += 1;
      else if (body[i] === ")") depth -= 1;
    }
    if (depth !== 0) continue; // unbalanced source; not this check's problem
    out.push({
      kind: hit[1],
      args: body.slice(hit.index + hit[0].length, i - 1).replace(/\s+/g, " ").trim(),
    });
  }
  return out;
}

/**
 * An inset that states no geometry.
 *
 * `DocumentInsets.zero()` and all-zero literals neutralise a default. Repeating
 * one across siblings is not a shared offset that belongs on a parent — it is
 * each child saying "not the default", which is a fact about each child.
 */
function isNeutral(args) {
  const text = args.replace(/\s+/g, "");
  if (/zero\(\)/.test(text)) return true;
  const numbers = text.match(/-?\d+(?:\.\d+)?/g);
  if (!numbers) return false;
  // Only when every number in the call is zero AND nothing else is in there —
  // `of(TABLE_PADDING + 1)` has a 1 and is not neutral.
  return /^[\w.]*\(?[-\d.fF,\s]*\)?$/.test(text) && numbers.every((n) => Number(n) === 0);
}

/**
 * Which edges a literal inset actually sets.
 *
 * `(0, 0, 5, 0)` is a trailing gap; `(0, 0, 0, 18)` is a left inset. Returns
 * null when the arguments are not four literals — a constant or an expression
 * is still a repeated inset, it just cannot be classified this precisely.
 */
function edgesOf(args) {
  const text = args.replace(/\s+/g, "");
  const literal = text.match(/^(?:newDocumentInsets\(|\()?(-?[\d.]+)f?,(-?[\d.]+)f?,(-?[\d.]+)f?,(-?[\d.]+)f?\)?$/);
  if (!literal) return null;
  const [top, right, bottom, left] = literal.slice(1, 5).map(Number);
  const set = [];
  if (top) set.push("top");
  if (right) set.push("right");
  if (bottom) set.push("bottom");
  if (left) set.push("left");
  return set;
}

/** Every method declared in the source, with its body. */
function methods(source) {
  const out = [];
  const seen = new Set();
  const declaration = /^[ \t]*(?:@\w+\s*)*(?:private|protected|public|static|final|\s)+[\w<>[\],. ]+?\s+(\w+)\s*\(/gm;
  let hit;
  while ((hit = declaration.exec(source)) !== null) {
    const name = hit[1];
    if (seen.has(name) || name === "if" || name === "for" || name === "while" || name === "switch") continue;
    const body = methodBody(source, name);
    if (body === null) continue;
    seen.add(name);
    out.push({ name, body });
  }
  return out;
}

/**
 * Geometry that several siblings state individually.
 *
 * The test this encodes is a revision request: "move the language list 6pt
 * left" should be one property change. When it is three, the value is on the
 * children and belongs on the parent.
 */
function repeatedSiblingOffset(method) {
  const findings = [];
  const groups = new Map();

  for (const { kind, args } of insetCalls(method.body)) {
    if (isNeutral(args)) continue;
    // An inset built from a named constant is the *relational geometry* rule
    // working, not a smell: `padding(DocumentInsets.of(TABLE_PADDING + 1))` on
    // two tables is one number in one place, which is the state being asked
    // for. Only repeated literals mean the value was written out by hand.
    if (/\b[A-Z][A-Z0-9_]{2,}\b/.test(args)) continue;
    const key = `${kind}(${args.replace(/\s+/g, "")})`;
    groups.set(key, { kind, args, count: (groups.get(key)?.count ?? 0) + 1 });
  }

  for (const [key, group] of groups) {
    if (group.count < 2) continue;
    const edges = edgesOf(group.args);
    const trailing = edges && edges.length === 1 && (edges[0] === "bottom" || edges[0] === "top");
    // Group on the whitespace-stripped key, print the spaced one: `new
    // DocumentInsets(...)` should not be shown back to an author as
    // `newDocumentInsets(...)`.
    const shown = `${group.kind}(${group.args})`;

    findings.push({
      kind: "repeated-sibling-offset",
      method: method.name,
      count: group.count,
      property: shown,
      detail: trailing
        ? `${group.count} siblings each set \`${shown}\` — a ${edges[0]} gap repeated is what ` +
          `\`spacing(...)\` on their parent is for; one property instead of ${group.count}`
        : `${group.count} siblings each set \`${shown}\` — if the value is true of the group, ` +
          `it belongs on their common parent in ${method.name}(), not on each child`,
    });
  }
  return findings;
}

/**
 * Negative margins, clustered.
 *
 * One is a deliberate local exception. Several in one region means the layout
 * is being pulled back into place after being built in the wrong structure, and
 * each of them bakes in today's metrics.
 */
function negativeMarginCluster(method, threshold) {
  const negatives = insetCalls(method.body).filter(({ args }) => /-\s*\d/.test(args));
  if (negatives.length < threshold) return [];
  return [
    {
      kind: "negative-margin-cluster",
      method: method.name,
      count: negatives.length,
      detail:
        `${negatives.length} negative insets in ${method.name}() — pulling content back into ` +
        "place usually means the structure above it is wrong; check whether an anchor or a " +
        "parent inset expresses the same layout",
    },
  ];
}

/**
 * A construction that stands in for a primitive the pinned pack has.
 *
 * Gated on the allow-list: before `addTimeline` existed this was the correct
 * way to build a timeline, and reporting it on a pack that lacks the primitive
 * would be telling an author to call something that is not there.
 */
function manualSemanticPattern(method, primitives) {
  const findings = [];
  const body = method.body;

  const verticalRule = /\.vertical\s*\(/.test(body);
  // Call sites, not identifiers. Counting the word "marker" matched the local
  // `markerLeft` in a skill-bar gauge twice and reported a slider as a
  // timeline — a rule that misreads one construct as another is worse than no
  // rule, because the next real finding is not believed either.
  const markers = (body.match(/\.(?:addCircle|addShape|addBullet)\s*\(/g) ?? []).length;
  // A rail plus one marker is a gauge. A timeline is a rail plus *repeated*
  // entries, so three is the smallest shape that cannot be anything else.
  if (primitives.has("addTimeline") && !/addTimeline/.test(body) && verticalRule && markers >= 3) {
    findings.push({
      kind: "manual-semantic-pattern",
      method: method.name,
      count: markers,
      detail:
        `${method.name}() draws a vertical rule beside ${markers} repeated markers — that is a ` +
        "timeline. `addTimeline(...)` with `TimelineBuilder` owns the rail, the gutter and the " +
        "spacing, and `keepTogether()` survives a page break where hand-placed markers do not",
    });
  }
  return findings;
}

/**
 * Too many independent positioning constants in one region.
 *
 * Not a count of numbers — a count of *distinct* ones. A method using the same
 * derived constant twenty times is fine; a method using twelve unrelated
 * literals has no layout, it has a list of coordinates that happened to work.
 */
function independentGeometryCluster(method, threshold) {
  const distinct = new Set();
  for (const { args } of insetCalls(method.body)) {
    if (isNeutral(args)) continue;
    for (const [, literal] of args.matchAll(/(?<![\w.])(-?\d+(?:\.\d+)?)f?(?![\w.])/g)) {
      if (Number(literal) !== 0) distinct.add(literal);
    }
  }
  if (distinct.size < threshold) return [];
  return [
    {
      kind: "independent-geometry-cluster",
      method: method.name,
      count: distinct.size,
      detail:
        `${distinct.size} distinct positioning literals in ${method.name}() — derive them from a ` +
        "base constant, or the next revision changes one number and the rest silently disagree",
    },
  ];
}

/**
 * Whether this source can be published as a project rather than as one file.
 *
 * Publishing splits the template into `theme/`, `sections/`, `composites/` and
 * `support/`, and the splitter refuses shapes it cannot account for. That
 * refusal used to surface at approve time, where the only choices left are
 * "publish flat" and "do not publish" — luma-co-studio-invoice shipped its
 * first structured-era bundle as three flat files over an overloaded helper
 * nobody had been told was a problem. The same question costs nothing in the
 * loop, where the answer is one rename away, so it is asked here.
 *
 * The plan is passed through because it takes part in naming, and a name
 * collision is one of the things that refuses.
 */
function bundleLayout(source, plan) {
  // Only a template is asked. The other checks here read any Java — a method,
  // a fragment, a snippet under test — and "this is not a template" is not a
  // finding about a template. A generated one always carries the entry point
  // the render runner calls, so that is the test.
  if (!/\bpublic\s+[\w.<>,?[\]]+\s+compose\s*\(/.test(source)) return [];

  const split = classify(source, { plan });
  if (split.feasible) return [];
  return [
    {
      kind: "bundle-publishes-flat",
      method: split.className ?? "the template",
      count: 1,
      detail:
        `approving this publishes a flat bundle — one file, no theme/ sections/ composites/ — ` +
        `because ${split.reason}. It is a minute's work here and not a choice at all at approve time`,
    },
  ];
}

/**
 * Report the structural smells in a generated template.
 *
 * @param {object} input
 * @param {string} input.source Java source of the generated template
 * @param {Set<string>} [input.primitives] symbols the pinned pack declares
 * @param {object} [input.thresholds]
 * @param {object|null} [input.plan] parsed `architecture-plan.json`, when there is one
 * @returns {Array<{kind: string, method: string, count: number, detail: string}>}
 */
export function checkStructuralSmells({
  source = "",
  primitives = new Set(),
  thresholds = {},
  plan = null,
} = {}) {
  const { negativeMargins = 3, independentLiterals = 8 } = thresholds;

  const findings = [...bundleLayout(source, plan)];
  for (const method of methods(source)) {
    findings.push(...repeatedSiblingOffset(method));
    findings.push(...negativeMarginCluster(method, negativeMargins));
    findings.push(...manualSemanticPattern(method, primitives));
    findings.push(...independentGeometryCluster(method, independentLiterals));
  }
  return findings;
}
