/**
 * scripts/lib/layout-doctor.mjs — is this layout built the way it will need to
 * be changed?
 *
 * `check-structural-smells.mjs` asks the same question of the **source**, and it
 * can only see what one render method wrote down. This asks it of the resolved
 * tree, where the answer is different in a way that matters: five paragraphs
 * that each carry a trailing gap look identical on the page to one parent with
 * `spacing(...)`, and the diff between them is zero — but the first is five
 * numbers a later revision has to find and move together, and the sixth
 * paragraph somebody adds will not have the gap.
 *
 * ## It is not a second front-end on the source check
 *
 * The plan for this expected one rule implementation with two inputs. Measured
 * against the corpus, that is not available, and the reason is worth stating
 * because it decides what this file may claim.
 *
 * The source check's central discriminator is **literal versus named
 * constant**. `padding(DocumentInsets.of(TABLE_PADDING))` repeated twice is the
 * relational-geometry rule working — one number, in one place — and the source
 * check deliberately skips it. `padding(0, 0, 5, 0)` repeated twice is the
 * smell. In a snapshot both are `5`. The distinction does not survive layout,
 * so a snapshot rule cannot make it and must not pretend to.
 *
 * What a snapshot *can* see is the thing the source check cannot: the resolved
 * tree. It sees siblings the source spreads across several methods, and it sees
 * geometry that arrived from a theme, a preset or a helper rather than from a
 * literal in the method under the cursor. So the two checks overlap and neither
 * contains the other, and the wording here never says "you typed this twice" —
 * only "this value is stated N times, and one property on the parent would
 * state it once".
 *
 * ## Calibrated against a real document before the thresholds were written
 *
 * On `charcoal-gold-cv` (248 nodes, a real approved CV):
 *
 * - **repeated sibling inset — 13 raw groups, 7 after folding.** They are the
 *   pattern this exists for: `Skills` has ten of eleven children each carrying
 *   `margin.bottom = 7.24`, `Contact` five of six at 9.84, `Languages` four of
 *   five at 5.98. Threshold 2, matching the source check's own census.
 *
 * The manual pass the plan asks for — reading all thirteen and judging each —
 * is what produced the two corrections that made the list worth reading:
 *
 * 1. **`spacing(...)` is not always the fix.** It applies to every gap in the
 *    parent, so it is only right when the sharers are effectively all of them.
 *    `Achievements` has four of six children sharing a top margin, but they
 *    alternate item/rule — spacing there would insert the gap between the other
 *    pairs too and change the page. Those get "one named constant" instead.
 * 2. **One component instantiated six times is one finding.** Six of the
 *    thirteen were `AchievementText_0/1/2` and `CertificationText_0/1/2`, every
 *    one of them "two of three children carry margin.bottom = 2". A reader
 *    scrolling past five restatements of a finding they have already read has
 *    been handed noise, so identical shapes fold into one entry that names the
 *    components it covers.
 *
 * After both: seven findings on a 248-node document, and a manual read of all
 * seven finds no false positive.
 * - **negative insets — 0**. Rare and precise; across the whole local corpus
 *   the telemetry baseline counts two. It stays because when it fires it means
 *   something, and it will not bury anything.
 *
 * A third candidate was measured and **dropped**: "three or more distinct
 * non-zero inset values among a parent's children", the snapshot reading of the
 * source check's independent-geometry cluster. It fired on nine parents, and
 * the loudest was `Body` — a two-column row whose two children have different
 * paddings, which is what a two-column layout *is*. Without the method scope
 * that makes the source version meaningful, it cannot separate a varied layout
 * from coordinate soup. Shipping it would repeat the failure Phase 8 recorded
 * and Phase 10 was calibrated to avoid: a check noisy enough to be switched off
 * is worse than no check.
 *
 * Evidence, never a gate, and never an auto-fix. The model decides and edits.
 *
 * No model is called from any path in this file.
 */

import { childrenOf, isRowParent, labelOf } from "./layout-inspector.mjs";

const EDGES = Object.freeze(["top", "right", "bottom", "left"]);

/**
 * Siblings sharing a value before it is worth reporting.
 *
 * Two, not three — the same number the source check settled on, and for the
 * same reason its census found: nothing in this corpus repeats a shared inset
 * three or more times as a *literal*, so a rule that only fired at three would
 * never fire there. The resolved tree is richer, but keeping the two checks on
 * one threshold means a reader comparing them is comparing like with like.
 */
export const SHARED_INSET_THRESHOLD = 2;

/** Negative insets in one parent's children before the cluster is reported. */
export const NEGATIVE_INSET_THRESHOLD = 2;

const round = (n) => Math.round(n * 1000) / 1000;

/**
 * What to put the value on instead.
 *
 * A trailing gap between stacked items is what `spacing(...)` is for; anything
 * else is the parent's padding on that edge. Naming the wrong one would send an
 * author to write the thing that does not compose.
 */
function suggestionFor(edge, laidOutAs, sharers, siblings) {
  // `spacing` applies to EVERY gap in the parent, so it is only the right answer
  // when the sharers are effectively all of them. The manual pass over the
  // reference CV is what forced this: `Achievements` has four of six children
  // sharing a top margin, but they alternate item/rule — putting spacing on the
  // parent would insert the gap between the other pairs too and change the page.
  // One short of all is the ordinary shape: a heading that carries no trailing
  // gap, followed by the items that do.
  const nearlyAll = sharers >= siblings - 1;
  const flowEdge =
    (laidOutAs === "column" && (edge === "bottom" || edge === "top"))
    || (laidOutAs === "row" && (edge === "left" || edge === "right"));

  if (flowEdge && nearlyAll) return "spacing(...) on the parent";
  if (flowEdge) {
    return "one named constant — spacing(...) would add the gap between the other children too";
  }
  return `padding.${edge} on the parent`;
}

/**
 * Geometry that several siblings state individually.
 *
 * The test this encodes is a revision request: "move the language list 6pt
 * left" should be one property change. When it is five, the value is on the
 * children and belongs on their parent.
 */
function repeatedSiblingInset(model, parent, threshold) {
  const kids = childrenOf(model, parent);
  if (kids.length < threshold) return [];

  const findings = [];
  for (const inset of ["margin", "padding"]) {
    for (const edge of EDGES) {
      const byValue = new Map();
      for (const child of kids) {
        const value = child[inset]?.[edge];
        // Zero is the absence of a choice, not a shared decision. Reporting it
        // would flag every default in the document — the specific false
        // positive the source check's census found twenty-one of.
        if (!value) continue;
        const sharers = byValue.get(value);
        if (sharers) sharers.push(child);
        else byValue.set(value, [child]);
      }

      for (const [value, sharers] of byValue) {
        if (sharers.length < threshold) continue;
        const laidOutAs = isRowParent(model, parent) ? "row" : "column";
        findings.push({
          kind: "repeated-sibling-inset",
          parent: { path: parent.path, name: parent.entityName, label: labelOf(parent) },
          property: `${inset}.${edge}`,
          value: round(value),
          count: sharers.length,
          siblings: kids.length,
          children: sharers.map((child) => ({ path: child.path, name: child.entityName })),
          suggestion: suggestionFor(edge, laidOutAs, sharers.length, kids.length),
          detail:
            `${sharers.length} of ${labelOf(parent)}'s ${kids.length} children each carry ` +
            `${inset}.${edge} = ${round(value)}. One value on the parent would say it once — ` +
            "and the next child somebody adds would inherit it instead of needing to remember it.",
        });
      }
    }
  }
  return findings;
}

/**
 * Negative insets, clustered.
 *
 * One is a deliberate local exception. Several under one parent means the
 * layout is being pulled back into place after being built in the wrong
 * structure, and each of them bakes in today's metrics.
 */
function negativeInsetCluster(model, parent, threshold) {
  const kids = childrenOf(model, parent);
  const offenders = [];
  for (const child of kids) {
    for (const inset of ["margin", "padding"]) {
      for (const edge of EDGES) {
        const value = child[inset]?.[edge];
        if (value < 0) offenders.push({ path: child.path, name: child.entityName, property: `${inset}.${edge}`, value: round(value) });
      }
    }
  }
  if (offenders.length < threshold) return [];
  return [
    {
      kind: "negative-inset-cluster",
      parent: { path: parent.path, name: parent.entityName, label: labelOf(parent) },
      property: null,
      value: null,
      count: offenders.length,
      siblings: kids.length,
      children: offenders,
      suggestion: "an anchor or a parent inset that expresses the same layout",
      detail:
        `${offenders.length} negative insets under ${labelOf(parent)} — pulling content back ` +
        "into place usually means the structure above it is wrong, and each one bakes in " +
        "today's font metrics.",
    },
  ];
}

/**
 * Fold one pattern repeated across sibling components into a single finding.
 *
 * The manual pass over the reference CV is what made this necessary. Six of its
 * thirteen findings were `AchievementText_0/1/2` and `CertificationText_0/1/2`,
 * every one of them "two of three children carry margin.bottom = 2" — which is
 * not six problems. It is one component, built once and instantiated six times,
 * and a reader who has to scroll past five restatements of a finding they have
 * already read has been given noise instead of a list.
 *
 * The signature is deliberately narrow: identical property, value, sharer count
 * and sibling count. Two genuinely different parents that happen to match on all
 * four are, for the purposes of the fix, the same finding anyway.
 */
function collapseRepeatedComponents(findings) {
  const groups = new Map();
  for (const finding of findings) {
    const key = `${finding.kind}|${finding.property}|${finding.value}|${finding.count}|${finding.siblings}`;
    const group = groups.get(key);
    if (group) group.push(finding);
    else groups.set(key, [finding]);
  }

  const out = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      out.push(group[0]);
      continue;
    }
    const [first] = group;
    out.push({
      ...first,
      repeatedAcross: group.map((f) => ({ path: f.parent.path, name: f.parent.name, label: f.parent.label })),
      detail:
        `${group.length} components each repeat the same shape: ${first.count} of ${first.siblings} ` +
        `children carrying ${first.property} = ${first.value} — ${group.map((f) => f.parent.label).slice(0, 3).join(", ")}` +
        (group.length > 3 ? ` and ${group.length - 3} more` : "") +
        ". One component, built once and instantiated repeatedly, so this is one fix rather than " +
        `${group.length}.`,
    });
  }
  return out;
}

/**
 * Diagnose a resolved layout.
 *
 * @param {object} model a loaded layout snapshot
 * @param {{scope?: object, thresholds?: object}} [options] `scope` limits the
 *   walk to one node's subtree
 * @returns {{findings: object[], examined: number, scope: string|null}}
 */
export function diagnose(model, { scope = null, thresholds = {} } = {}) {
  const sharedThreshold = thresholds.sharedInset ?? SHARED_INSET_THRESHOLD;
  const negativeThreshold = thresholds.negativeInset ?? NEGATIVE_INSET_THRESHOLD;

  const inScope = new Set();
  if (scope) {
    const walk = (node) => {
      inScope.add(node.path);
      for (const child of childrenOf(model, node)) walk(child);
    };
    walk(scope);
  }

  const findings = [];
  let examined = 0;
  for (const node of model.nodes) {
    if (scope && !inScope.has(node.path)) continue;
    if (childrenOf(model, node).length === 0) continue;
    examined += 1;
    findings.push(...repeatedSiblingInset(model, node, sharedThreshold));
    findings.push(...negativeInsetCluster(model, node, negativeThreshold));
  }

  const collapsed = collapseRepeatedComponents(findings);

  // Loudest first: a value stated ten times is a more valuable fix than one
  // stated twice, and a reader who only reads the top of the list should get
  // the one worth doing.
  collapsed.sort((a, b) => b.count - a.count || a.parent.path.localeCompare(b.parent.path) || String(a.property).localeCompare(String(b.property)));
  return { findings: collapsed, examined, scope: scope ? scope.path : null };
}

/**
 * Which nodes a property change reaches, structurally.
 *
 * Deliberately **not** a prediction of the resulting layout. Saying where a
 * change lands is a question about the tree, which the snapshot answers
 * exactly; saying what the page will then look like needs a measure pass, and a
 * tool that guessed it would be inventing the geometry this whole track exists
 * to stop inventing.
 *
 * @returns {{directly: object[], transitively: object[], unaffectedCount: number}}
 */
export function impact(model, node) {
  const directly = childrenOf(model, node).map((child) => ({ path: child.path, name: child.entityName }));
  const transitively = [];
  const walk = (current, depth) => {
    for (const child of childrenOf(model, current)) {
      if (depth > 0) transitively.push({ path: child.path, name: child.entityName });
      walk(child, depth + 1);
    }
  };
  walk(node, 0);

  // Later siblings move too when the change alters this node's height: they are
  // stacked after it. Reported separately from descendants because the reason
  // is different and so is the fix.
  const parent = node.parentPath ? model.byPath.get(node.parentPath) : null;
  const siblingsAfter = parent
    ? childrenOf(model, parent)
        .filter((sibling) => (sibling.childIndex ?? 0) > (node.childIndex ?? 0))
        .map((sibling) => ({ path: sibling.path, name: sibling.entityName }))
    : [];

  const touched = new Set([node.path, ...directly.map((d) => d.path), ...transitively.map((t) => t.path), ...siblingsAfter.map((s) => s.path)]);
  return {
    node: { path: node.path, name: node.entityName },
    directly,
    transitively,
    siblingsAfter,
    unaffectedCount: model.nodes.length - touched.size,
  };
}
