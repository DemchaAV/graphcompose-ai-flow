/**
 * scripts/lib/layout-diff.mjs — did the patch do what it claimed, and nothing else?
 *
 * A pixel diff answers "does it look right now". It cannot answer the question
 * that actually decides whether a revision is safe to keep: *did anything move
 * that I did not mean to move*. Two renders can be visually indistinguishable
 * in the region under review while a section three pages away has quietly
 * shifted, and the loop has no way to notice until a human opens the PDF.
 *
 * Two layout snapshots do answer it, because the engine measured both.
 *
 * ## Authored versus derived
 *
 * The distinction the rest of this file turns on: **insets are written by a
 * person, placement is computed by the engine.** Nobody types an x coordinate
 * into a GraphCompose template — they type `padding(0, 0, 0, 12)` and the
 * engine works out that three paragraphs now start at 12. So in a diff:
 *
 * - a change to `margin.*` or `padding.*`, or to a node's position in the tree,
 *   is an **authored** change — someone edited it;
 * - a change to `placementX/Y/Width/Height` or to a page range is a **derived**
 *   change — a consequence of an authored change somewhere.
 *
 * That turns "47 nodes changed" into something a reader can act on. Every
 * derived change either descends from an authored one, in which case it is the
 * intended blast radius, or it does not — and that is **collateral**: the
 * engine moved something no edit explains.
 *
 * Collateral is not always a defect. The fixture pair in
 * `scripts/test/fixtures/layout-diff-pair/` adds 12 of left padding to one
 * section and the document root grows by 12, because its widest child got
 * wider. Nothing is wrong, but nothing in the edit said "make the root wider"
 * either, and a reviewer who has not been told will not think to look up. The
 * point is to say it out loud, not to fail on it.
 *
 * ## Ownership
 *
 * Item 13, and the reason this is worth more than a `diff` of two JSON files:
 * when two or more siblings each gain the *same* inset in the same revision,
 * that inset belongs on their parent. Three paragraphs that each grew
 * `margin.left = 12` render identically to one parent with
 * `padding.left = 12`, and the difference only shows up later — when a fourth
 * paragraph is added without the margin, or when the value has to move and
 * there are three copies of it.
 *
 * It is reported as evidence with a recommended owner and a property
 * candidate. Nothing here edits anything: the model decides, the tool measures.
 * That is the same contract `check-structural-smells.mjs` has, and for the same
 * reason — a heuristic that rewrote templates would be worse than the guessing
 * it replaces.
 *
 * No model is called from any path in this file.
 */

import { EPSILON, childrenOf, labelOf } from "./layout-inspector.mjs";

/**
 * Geometry the engine computed. A change here is a consequence, never a cause.
 *
 * `contentWidth`/`contentHeight` are deliberately absent: they are equal to
 * `placementWidth`/`placementHeight` on every node ever measured (see
 * `layout-inspector.mjs`), so comparing them would double every geometry entry
 * with a second line saying the same thing.
 */
const DERIVED_SCALARS = ["placementX", "placementY", "placementWidth", "placementHeight", "startPage", "endPage"];

/** Written by a person, in the template. A change here is a cause. */
const AUTHORED_INSETS = ["margin", "padding"];

/** Structure. Authored too — a node moved in the tree because someone moved it. */
const AUTHORED_SCALARS = ["parentPath", "childIndex", "entityName", "entityKind"];

const EDGES = ["top", "right", "bottom", "left"];

const near = (a, b) => Math.abs(a - b) <= EPSILON;
const round = (n) => Math.round(n * 1000) / 1000;

/**
 * Compare one node against its counterpart.
 *
 * @returns {{authored: object, derived: object}} property → `[before, after]`,
 *   each empty when nothing of that kind changed
 */
function compareNode(before, after) {
  const authored = {};
  const derived = {};

  for (const key of DERIVED_SCALARS) {
    const a = before[key];
    const b = after[key];
    if (typeof a === "number" && typeof b === "number") {
      if (!near(a, b)) derived[key] = [round(a), round(b)];
    } else if (a !== b) {
      derived[key] = [a ?? null, b ?? null];
    }
  }
  for (const inset of AUTHORED_INSETS) {
    for (const edge of EDGES) {
      const a = before[inset]?.[edge];
      const b = after[inset]?.[edge];
      if (typeof a === "number" && typeof b === "number" && !near(a, b)) {
        authored[`${inset}.${edge}`] = [round(a), round(b)];
      }
    }
  }
  for (const key of AUTHORED_SCALARS) {
    if ((before[key] ?? null) !== (after[key] ?? null)) {
      authored[key] = [before[key] ?? null, after[key] ?? null];
    }
  }
  return { authored, derived };
}

/** Every path from a node down through its subtree, the node included. */
function subtreePaths(model, node, into = new Set()) {
  into.add(node.path);
  for (const child of childrenOf(model, node)) subtreePaths(model, child, into);
  return into;
}

/**
 * Does any strict ancestor of `path` carry an authored change?
 *
 * Walks the recorded `parentPath` chain of the *after* snapshot, which is the
 * tree the reader is looking at. A node whose parent was itself re-parented is
 * rare enough that the authored `parentPath` change on it is the finding.
 */
function hasAuthoredAncestor(path, byPath, authoredPaths) {
  let cursor = byPath.get(path)?.parentPath ?? null;
  while (cursor) {
    if (authoredPaths.has(cursor)) return cursor;
    cursor = byPath.get(cursor)?.parentPath ?? null;
  }
  return null;
}

/**
 * Siblings that each gained the same inset in this revision.
 *
 * Two, not three. The census behind `check-structural-smells.mjs` found that
 * nothing in this repository's corpus repeats a shared inset three or more
 * times, so a rule that only fired at three would never fire at all. A delta of
 * zero is excluded for the same reason it is there: neutralising a default is
 * not a statement of shared geometry.
 */
function ownershipFindings(changed, afterModel) {
  // Keyed by (parent, property, delta) held as a structure rather than a joined
  // string: a delimiter that turns out to occur inside a node path silently
  // merges two unrelated groups, and there is no delimiter a path is guaranteed
  // never to contain.
  const groups = new Map();
  for (const entry of changed) {
    const node = afterModel.byPath.get(entry.path);
    if (!node?.parentPath) continue;
    for (const [property, [from, to]] of Object.entries(entry.changes.authored)) {
      if (!property.startsWith("margin.") && !property.startsWith("padding.")) continue;
      const delta = round(to - from);
      if (delta === 0) continue;

      let byProperty = groups.get(node.parentPath);
      if (!byProperty) groups.set(node.parentPath, (byProperty = new Map()));
      let byDelta = byProperty.get(property);
      if (!byDelta) byProperty.set(property, (byDelta = new Map()));
      const siblings = byDelta.get(delta);
      if (siblings) siblings.push(entry.path);
      else byDelta.set(delta, [entry.path]);
    }
  }

  const findings = [];
  for (const [parentPath, byProperty] of groups) {
    for (const [property, byDelta] of byProperty) {
      for (const [delta, siblings] of byDelta) {
        if (siblings.length < 2) continue;
        const parent = afterModel.byPath.get(parentPath);
        const edge = property.split(".")[1];
        findings.push({
          pattern: "shared-sibling-displacement",
          recommendedOwner: parentPath,
          recommendedOwnerName: parent ? labelOf(parent) : null,
          // A trailing gap between items is what `spacing` is for; anything else
          // is the parent's padding on that edge.
          propertyCandidate: edge === "bottom" || edge === "top" ? `spacing(${Math.abs(delta)})` : `padding.${edge}`,
          property,
          delta,
          siblings,
          note:
            `${siblings.length} siblings each gained ${property} ${delta} in this revision. ` +
            "They render identically to one value on the parent, and separately they are " +
            "N numbers a later revision has to find and move together — and the next sibling " +
            "somebody adds will not have it.",
        });
      }
    }
  }
  return findings;
}

/**
 * Diff two loaded snapshots.
 *
 * @param {object} beforeModel from `loadSnapshot`
 * @param {object} afterModel from `loadSnapshot`
 * @param {{regionNode?: object}} [options] `regionNode` scopes the comparison to
 *   one node's subtree, resolved against the *after* snapshot
 * @returns {object} the diff
 */
export function diffSnapshots(beforeModel, afterModel, { regionNode = null } = {}) {
  const scope = regionNode ? subtreePaths(afterModel, regionNode) : null;
  const inScope = (path) => !scope || scope.has(path);

  const added = [];
  const removed = [];
  const changed = [];
  let compared = 0;
  let unchanged = 0;

  for (const node of afterModel.nodes) {
    if (!inScope(node.path)) continue;
    const before = beforeModel.byPath.get(node.path);
    if (!before) {
      added.push({ path: node.path, name: node.entityName, kind: node.entityKind });
      continue;
    }
    compared += 1;
    const changes = compareNode(before, node);
    const authoredCount = Object.keys(changes.authored).length;
    const derivedCount = Object.keys(changes.derived).length;
    if (authoredCount === 0 && derivedCount === 0) {
      unchanged += 1;
      continue;
    }
    changed.push({
      path: node.path,
      name: node.entityName,
      kind: node.entityKind,
      changes,
      authored: authoredCount > 0,
    });
  }

  for (const node of beforeModel.nodes) {
    if (!inScope(node.path)) continue;
    if (!afterModel.byPath.has(node.path)) {
      removed.push({ path: node.path, name: node.entityName, kind: node.entityKind });
    }
  }

  const authoredPaths = new Set(changed.filter((c) => c.authored).map((c) => c.path));

  const affectedDescendants = [];
  const collateral = [];
  for (const entry of changed) {
    if (entry.authored) continue;
    const owner = hasAuthoredAncestor(entry.path, afterModel.byPath, authoredPaths);
    if (owner) affectedDescendants.push({ ...entry, explainedBy: owner });
    else collateral.push(entry);
  }

  const pagination = {
    before: beforeModel.totalPages,
    after: afterModel.totalPages,
    changed: beforeModel.totalPages !== afterModel.totalPages,
  };

  return {
    scope: regionNode ? { region: regionNode.path, name: regionNode.entityName, nodes: scope.size } : null,
    totals: {
      before: beforeModel.nodes.length,
      after: afterModel.nodes.length,
      compared,
      unchanged,
      changed: changed.length,
    },
    pagination,
    // The plan's shape, kept verbatim so callers written against it still work.
    changedNodes: changed,
    affectedDescendants,
    // The classification the collateral gate reads.
    authoredChanges: changed.filter((c) => c.authored),
    collateral,
    added,
    removed,
    ownership: ownershipFindings(changed, afterModel),
  };
}

/**
 * Compare what a revision said it would move against what moved.
 *
 * `expected` is the revision's `expectedAffectedNodes` — names or paths, since a
 * person writing a revision knows the region by name and not by node path. A
 * name that matches nothing is reported rather than ignored: the usual cause is
 * a typo, and silently treating it as "nothing expected" would turn the whole
 * check off exactly when someone tried to use it.
 *
 * @returns {{unexpected: object[], unmatchedExpectations: string[], satisfied: string[]}}
 */
export function compareExpectation(diff, expected, afterModel) {
  const wanted = Array.isArray(expected) ? expected.filter((e) => typeof e === "string" && e.trim() !== "") : [];
  if (wanted.length === 0) {
    return { declared: false, unexpected: [], unmatchedExpectations: [], satisfied: [] };
  }

  const expectedSubtrees = new Set();
  const unmatchedExpectations = [];
  const satisfied = [];
  for (const raw of wanted) {
    const selector = raw.trim();
    const matches = afterModel.nodes.filter((n) => n.path === selector || n.entityName === selector || n.path.endsWith(`/${selector}`));
    if (matches.length === 0) {
      unmatchedExpectations.push(selector);
      continue;
    }
    satisfied.push(selector);
    for (const match of matches) subtreePaths(afterModel, match, expectedSubtrees);
  }

  const unexpected = diff.changedNodes.filter((entry) => !expectedSubtrees.has(entry.path));
  return { declared: true, unexpected, unmatchedExpectations, satisfied };
}
