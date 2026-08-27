/**
 * scripts/lib/evidence-package.mjs — what kind of thing is wrong, and what is
 * the smallest set of facts that settles it?
 *
 * A review agent looking at one mismatch currently gets a page of pixels and a
 * hunch. It has to decide, from an image, whether a block is in the wrong place
 * or merely the wrong colour — and those have nothing in common. A geometry
 * defect is a layout property on a named owner. A wrong icon is a file, and
 * **must never be compensated with margins**. A document that paginated
 * differently makes every per-node comparison meaningless until it is fixed.
 * Same picture, three unrelated fixes.
 *
 * Three deterministic sources already answer most of it, and nothing was
 * joining them:
 *
 * - `visual-analysis.json` — the regions, as read off the **reference**:
 *   id, role, and fractional bounds.
 * - `region-diff-stats.json` — how much of each region's pixels differ, and
 *   where, measured by the differ.
 * - `layout-snapshot.json` — where the engine actually put every node.
 *
 * The first two are about appearance and the third is about geometry, which is
 * the split this whole track rests on: **JSON answers where, PNG answers what
 * it looks like.** Joining them turns "this region is 40% different" into "the
 * node that owns this region is 14pt left of where the reference puts it, and
 * `Sidebar.padding.left` is the term that moved".
 *
 * ## It classifies only what two measurements can decide
 *
 * The cause vocabulary has seven values and this assigns four of them:
 *
 * - `PAGINATION` — the page counts differ. A fact, and it outranks everything
 *   else: comparing node positions across two different paginations is
 *   comparing two different documents.
 * - `GEOMETRY` — the region's owning node is displaced past tolerance from
 *   where the reference region says it should be. Two measurements, subtracted.
 * - `ASSET` — the geometry is right, the region's role is one that carries an
 *   image, and its interior pixels are heavily different. That is the item-23
 *   rule, and it exists mostly to stop the other failure: an agent seeing a
 *   wrong icon and nudging margins until the *wrong* icon lines up.
 * - `TYPOGRAPHY` — the snapshot says the text was set in a font the style did
 *   not name. Not a guess from pixels: GraphCompose reports the declared and the
 *   resolved font side by side, and a mismatch is a fact. It outranks a geometry
 *   verdict, because a substituted font changes every measurement the geometry
 *   comparison is made of — the box moved *because* the type did.
 * - `UNKNOWN` — everything else, and it is a real answer.
 *
 * `PAINT` and `CONTENT` are in the vocabulary and are still **not** assigned
 * here, and neither is `TYPOGRAPHY` on anything subtler than a substitution.
 * Telling a wrong size from a wrong colour from different words needs a
 * comparison against the reference's own type, which is `typography.mjs`'s job
 * and needs a crop a human chose. A classifier that guessed between them would
 * be the pixel-staring it replaces, wearing a JSON hat. So they are returned as
 * **candidates** on an `UNKNOWN` verdict, with the reason the evidence cannot
 * separate them.
 *
 * ## Bounded on purpose
 *
 * The package is the deliverable and its size is a feature. A region's
 * hierarchy is capped, its children are summarised rather than listed in full,
 * and the snapshot never travels. Item 26's rule — targeted evidence, never the
 * whole file — is what the byte budget in the tests is protecting.
 *
 * No model is called from any path in this file.
 */

import {
  ancestorsOf,
  childrenOf,
  contentBoxOf,
  explain,
  labelOf,
  parentOf,
  topOf,
  typographyUnder,
} from "./layout-inspector.mjs";

/**
 * How far a node may sit from where the reference region puts it before the
 * mismatch is called GEOMETRY, as a fraction of the page's short edge.
 *
 * Region bounds are read off an image by eye and rounded to four decimals, so
 * they carry real error — on A4 at these fractions, a rounding of 0.0005 is
 * already 0.3pt, and the analyst's own reading is worth several points more.
 * 0.5% of the short edge is about 3pt on A4: comfortably above that noise and
 * well below anything a reviewer would call misaligned.
 */
export const GEOMETRY_TOLERANCE_FRACTION = 0.005;

/** Interior mismatch above which a correctly-placed image is the wrong image. */
export const ASSET_INTERIOR_THRESHOLD_PERCENT = 25;

/** Region roles that carry a file rather than drawn output. */
const ASSET_ROLES = new Set(["image", "icon", "logo"]);

/** Ancestors carried in a package. Enough to locate a node, not the whole spine. */
const HIERARCHY_LIMIT = 4;

/** Children listed individually before the rest are counted instead. */
const CHILDREN_LIMIT = 8;

const round = (n) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null);

/**
 * A region's fractional bounds, in the page's own coordinates.
 *
 * Two conversions, and both are easy to get silently wrong. Bounds are
 * fractions of the page, so they need the canvas to become points. And they are
 * read off an **image**, where y grows downward from the top, while the
 * snapshot is in PDF space, where y grows upward from the bottom. A package
 * that mixed the two would report every vertical delta with the sign flipped,
 * and the reviewer would move the node the wrong way.
 */
export function regionToPageRect(bounds, canvas) {
  const width = canvas.pageWidth;
  const height = canvas.pageHeight;
  const x = bounds.x * width;
  const w = bounds.w * width;
  // Image-space top → PDF-space top edge.
  const top = height - bounds.y * height;
  const h = bounds.h * height;
  return { x, right: x + w, width: w, top, bottom: top - h, height: h };
}

/**
 * How much of two rectangles is shared, over how much they cover together.
 *
 * Intersection over union, because the two obvious alternatives are both wrong
 * here. "Contains the region" fails on bounds a human read off an image: the
 * `sidebar-skills` region of the reference CV starts 0.63pt left of the section
 * that draws it, so strict containment skipped `Skills` and named the entire
 * 797pt `Sidebar` column — an owner whose displacement then reads 338pt and
 * means nothing. And "overlaps the region" is satisfied by every ancestor up to
 * the page. Union in the denominator is what penalises a node for being much
 * bigger than the region, which is exactly the failure to avoid.
 */
function intersectionOverUnion(node, rect) {
  const left = Math.max(node.placementX, rect.x);
  const right = Math.min(node.placementX + node.placementWidth, rect.right);
  const bottom = Math.max(node.placementY, rect.bottom);
  const top = Math.min(topOf(node), rect.top);
  if (right <= left || top <= bottom) return 0;

  const shared = (right - left) * (top - bottom);
  const union = node.placementWidth * node.placementHeight + rect.width * rect.height - shared;
  return union > 0 ? shared / union : 0;
}

/**
 * Below this, nothing in the layout corresponds to the region well enough to be
 * called its owner. Naming a poor match would be worse than naming none: every
 * number downstream — the displacement, the recommended properties — is
 * computed against the owner, so a wrong owner produces confident nonsense.
 */
export const OWNER_MATCH_FLOOR = 0.25;

/**
 * How far the owner's size may differ from the region's before a difference
 * between their positions stops meaning anything, as a fraction of the region.
 *
 * A displacement is only readable when the two boxes are the *same box in a
 * different place*. When they are different sizes they are different boxes, and
 * subtracting their corners measures the disagreement about what the region is —
 * not the layout.
 *
 * This deliberately gates on size rather than on overlap. Overlap drops for both
 * reasons at once: a node genuinely displaced by 40pt overlaps its region no
 * better than a node that is simply the wrong shape, so a floor on overlap would
 * suppress the true positives along with the false one.
 *
 * Measured on the reference CV's own review. Six of its seven mismatches sit
 * within 4.4% on width and correctly come back "not geometry", every delta under
 * 2.5pt. The seventh, `masthead`, is **45% adrift on width** — the analyst's
 * region covers a name, a title and a rule, and the `Masthead` node is not that
 * box. Its 11.5pt "displacement" is an artifact of comparing two rectangles that
 * are not the same rectangle, and it was the ONLY positive the classifier
 * produced on real data. A confident wrong cause is the failure this whole track
 * exists to remove.
 */
export const SHAPE_AGREEMENT_TOLERANCE = 0.25;

/**
 * The node that owns a region: the one whose box best coincides with it.
 *
 * Ties break toward the deeper node, since a section and the single child
 * filling it can score identically and the child is the more specific answer.
 *
 * @returns {{node: object|null, basis: string, match: number}}
 */
export function regionOwner(model, rect) {
  let best = null;
  let bestScore = 0;
  for (const node of model.nodes) {
    const score = intersectionOverUnion(node, rect);
    if (score > bestScore + 1e-9 || (best && Math.abs(score - bestScore) <= 1e-9 && node.depth > best.depth)) {
      if (score <= 0) continue;
      best = node;
      bestScore = Math.max(bestScore, score);
    }
  }

  if (!best || bestScore < OWNER_MATCH_FLOOR) {
    return {
      node: null,
      match: round(bestScore),
      basis: best
        ? `no node matches this region closely enough (best overlap ${round(bestScore * 100)}%, floor ${OWNER_MATCH_FLOOR * 100}%) — ` +
          "the region may span siblings, or its bounds may be wrong"
        : "no node overlaps the region at all",
    };
  }
  return { node: best, match: round(bestScore), basis: `best overlap with the region (${round(bestScore * 100)}%)` };
}

/**
 * How far the owning node sits from where the reference puts the region.
 *
 * Reported for the two edges a reader can act on — the left edge and the top —
 * because "the block is 14 left and 6 high" is an instruction and a centre
 * offset is a riddle. Positive x means the render is to the right of the
 * reference; positive y means it is higher up the page, in the reader's sense
 * of higher rather than the coordinate's.
 */
export function displacement(node, rect) {
  return {
    deltaX: round(node.placementX - rect.x),
    deltaY: round(topOf(node) - rect.top),
    deltaWidth: round(node.placementWidth - rect.width),
    deltaHeight: round(node.placementHeight - rect.height),
  };
}

/**
 * Decide the cause, or decline to.
 *
 * Order matters and is not arbitrary: pagination invalidates the comparison
 * every later rule depends on, so it is checked first and short-circuits.
 *
 * @returns {{cause: string, basis: string, candidates: string[]}}
 */
export function classifyCause({ pagination = null, displaced = null, tolerance = null, role = null, interiorPercent = null, substitutedFonts = [], regionRect = null, typographyReported = false }) {
  if (pagination && pagination.expected != null && pagination.actual != null && pagination.expected !== pagination.actual) {
    return {
      cause: "PAGINATION",
      basis: `the render has ${pagination.actual} page(s) and the reference ${pagination.expected} — every per-node comparison is against a different layout until this is resolved`,
      candidates: [],
    };
  }

  // Checked before geometry on purpose. A substituted font changes every glyph
  // width in the run, so the box is a different size *because* the type is wrong —
  // reporting GEOMETRY here would send the next pass to move a block whose
  // position is a symptom.
  if (substitutedFonts.length > 0) {
    const [first] = substitutedFonts;
    return {
      cause: "TYPOGRAPHY",
      basis:
        `the style asked for ${first.declaredFont} and the document is set in ${first.resolvedFamily}` +
        (first.decoration && first.decoration !== "DEFAULT" ? ` ${first.decoration}` : "") +
        (substitutedFonts.length > 1 ? ` (and ${substitutedFonts.length - 1} more run(s) in this region)` : "") +
        ". It lays out and draws without error, so nothing else reports it. Fix the style, " +
        "not the geometry: the box is the size it is because the type is",
      candidates: [],
    };
  }

  if (!displaced) {
    return {
      cause: "UNKNOWN",
      basis: "no layout snapshot for this revision, so nothing here can separate a geometry defect from an appearance one",
      candidates: ["GEOMETRY", "TYPOGRAPHY", "PAINT", "ASSET", "CONTENT"],
    };
  }

  const worst = Math.max(Math.abs(displaced.deltaX ?? 0), Math.abs(displaced.deltaY ?? 0));
  // Are the two boxes even the same size? If not, the corners disagree about
  // what the region *is*, and subtracting them measures that rather than the
  // layout.
  const sizeError =
    regionRect && regionRect.width > 0 && regionRect.height > 0
      ? Math.max(
          Math.abs(displaced.deltaWidth ?? 0) / regionRect.width,
          Math.abs(displaced.deltaHeight ?? 0) / regionRect.height,
        )
      : 0;
  if (tolerance != null && worst > tolerance && sizeError > SHAPE_AGREEMENT_TOLERANCE) {
    return {
      cause: "UNKNOWN",
      basis:
        `the owning node is ${round(sizeError * 100)}% off the region's own size, so the two are not ` +
        `the same box — the ${round(worst)}pt between their corners measures that disagreement, not a ` +
        "displacement. Re-read the region's bounds before treating this as geometry",
      candidates: ["GEOMETRY", "TYPOGRAPHY", "PAINT", "CONTENT"],
    };
  }
  if (tolerance != null && worst > tolerance) {
    return {
      cause: "GEOMETRY",
      basis: `the owning node is ${round(worst)}pt from where the reference region puts it, past the ${round(tolerance)}pt tolerance`,
      candidates: [],
    };
  }

  if (
    role &&
    ASSET_ROLES.has(role) &&
    interiorPercent != null &&
    interiorPercent >= ASSET_INTERIOR_THRESHOLD_PERCENT
  ) {
    return {
      cause: "ASSET",
      basis:
        `the box is within tolerance and ${round(interiorPercent)}% of a ${role} region's pixels differ — ` +
        "the geometry is right and the file is wrong. Do NOT compensate an asset with margins: it moves the wrong picture into place",
      candidates: [],
    };
  }

  // The wording branches on whether this render reported typography at all,
  // because "we looked and the font is right" and "nothing looked" are different
  // answers and a reader acts differently on each.
  return {
    cause: "UNKNOWN",
    basis: typographyReported
      ? "the box is where the reference puts it, so this is not geometry, and the font it was set in is " +
        "the one the style asked for. What is left — the size, the colour, the words — needs a comparison " +
        "against the reference's own type, which is scripts/typography.mjs and needs a crop"
      : "the box is where the reference puts it, so this is not geometry. This render reports no typography " +
        "(it predates GraphCompose 2.2.2), so a wrong font here would be invisible — re-render before " +
        "ruling one out. Size, colour and wording need a comparison against the reference's own type",
    candidates: ["TYPOGRAPHY", "PAINT", "CONTENT"],
  };
}

/** A node, small. */
const brief = (node) => ({
  path: node.path,
  name: node.entityName,
  kind: node.entityKind,
  x: round(node.placementX),
  y: round(node.placementY),
  width: round(node.placementWidth),
  height: round(node.placementHeight),
});

/**
 * Which layout properties could move this node, given how its position is
 * actually derived.
 *
 * Not a guess: it re-uses the inspector's chain, so the properties named are
 * the terms that produced the number. A node whose x comes from
 * `Sidebar.padding.left` is moved by editing `Sidebar`, and saying "add a
 * margin to this node" would be the compensating constant the authoring rules
 * forbid.
 */
function recommendedProperties(model, node, displaced) {
  const wanted = [];
  if (Math.abs(displaced.deltaX ?? 0) > 0) wanted.push("x");
  if (Math.abs(displaced.deltaY ?? 0) > 0) wanted.push("y");
  if (wanted.length === 0) return [];

  const seen = new Set();
  const properties = [];
  for (const coordinate of wanted) {
    const result = explain(model, node, coordinate);
    if (!result.derivable) {
      properties.push({
        coordinate,
        owner: null,
        property: null,
        note: result.note,
      });
      continue;
    }
    for (const term of result.terms) {
      // `Sidebar.padding.left` → owner `Sidebar`, property `padding.left`.
      const at = term.label.indexOf(".");
      if (at < 0) continue;
      const owner = term.label.slice(0, at);
      const property = term.label.slice(at + 1);
      if (!/^(margin|padding|spacing)\./.test(property)) continue;
      const key = `${coordinate} ${term.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      properties.push({ coordinate, owner, property, contributes: term.value });
    }
    if (!result.exact) {
      properties.push({
        coordinate,
        owner: null,
        property: null,
        note: `${result.residual}pt of this coordinate is unattributed — ${result.note}`,
      });
    }
  }
  return properties;
}

/**
 * Build the bounded package for one mismatch.
 *
 * Every input is optional except the region, because the loop legitimately
 * reaches this point without some of them — a revision rendered by a
 * GraphCompose older than the snapshot writer has no geometry at all, and a
 * package that threw there would be a package nobody could rely on. Missing
 * inputs narrow the answer and are reported as the reason it narrowed.
 *
 * @param {object} input
 * @param {object} input.region the region from `visual-analysis.json`
 * @param {object} [input.mismatch] the mismatch from `visual-review.json`
 * @param {object} [input.regionStats] this region's entry in `region-diff-stats.json`
 * @param {object} [input.model] a loaded layout snapshot
 * @param {{expected: number|null, actual: number|null}} [input.pagination]
 * @param {string[]} [input.crops] paths to the reference/output crops
 */
export function buildEvidencePackage({
  region,
  mismatch = null,
  regionStats = null,
  model = null,
  pagination = null,
  crops = [],
}) {
  if (!region || typeof region.id !== "string") {
    throw new TypeError("an evidence package needs a region with an id");
  }

  const pkg = {
    region: {
      id: region.id,
      label: region.label ?? null,
      role: region.role ?? null,
      page: region.page ?? null,
      bounds: region.bounds ?? null,
    },
    mismatch: mismatch
      ? {
          id: mismatch.id ?? null,
          severity: mismatch.severity ?? null,
          component: mismatch.component ?? null,
          rootCause: mismatch.rootCause ?? null,
          source: mismatch.source ?? null,
        }
      : null,
    appearance: regionStats
      ? {
          percent: round(regionStats.percent),
          classification: regionStats.classification ?? null,
          shareOfPageMismatch: round(regionStats.shareOfPageMismatch),
          concentration: round(regionStats.concentration),
        }
      : null,
    layout: null,
    hierarchy: [],
    children: null,
    ownership: null,
    recommendedProperties: [],
    crops: crops.slice(0, 2),
  };

  let displaced = null;
  let tolerance = null;
  let owner = null;
  let substitutedFonts = [];

  if (model && region.bounds) {
    const rect = regionToPageRect(region.bounds, model.canvas);
    const found = regionOwner(model, rect);
    owner = found.node;
    tolerance = Math.min(model.canvas.pageWidth, model.canvas.pageHeight) * GEOMETRY_TOLERANCE_FRACTION;

    pkg.ownership = {
      owner: owner ? brief(owner) : null,
      basis: found.basis,
      match: found.match,
      // The region as the reference describes it, in the same units as the
      // node beside it — otherwise the two numbers cannot be subtracted by eye.
      referenceRect: {
        x: round(rect.x),
        top: round(rect.top),
        width: round(rect.width),
        height: round(rect.height),
      },
    };

    if (owner) {
      displaced = displacement(owner, rect);
      const content = contentBoxOf(owner);
      const parent = parentOf(model, owner);
      const kids = childrenOf(model, owner);
      pkg.layout = {
        ...brief(owner),
        top: round(topOf(owner)),
        content: { x: round(content.x), top: round(content.top), width: round(content.width), height: round(content.height) },
        margin: owner.margin,
        padding: owner.padding,
        pages: { start: owner.startPage, end: owner.endPage, spansPages: owner.startPage !== owner.endPage },
        parent: parent ? { path: parent.path, name: parent.entityName } : null,
        displacement: displaced,
        toleranceP: round(tolerance),
      };
      pkg.hierarchy = ancestorsOf(model, owner)
        .slice(-HIERARCHY_LIMIT)
        .map((n) => ({ path: n.path, name: n.entityName, kind: n.entityKind }));
      pkg.children = {
        count: kids.length,
        listed: kids.slice(0, CHILDREN_LIMIT).map(brief),
        omitted: Math.max(0, kids.length - CHILDREN_LIMIT),
      };
      pkg.recommendedProperties = recommendedProperties(model, owner, displaced);

      // The whole subtree, not just the owner: a region's owner is a section and
      // the text is in its children.
      const runs = typographyUnder(model, owner);
      substitutedFonts = runs.filter((run) => run.fontSubstituted);
      if (runs.length) {
        pkg.typography = {
          runs: runs.length,
          fonts: [...new Set(runs.map((run) => run.resolvedFamily))],
          substituted: substitutedFonts.map((run) => ({
            path: run.path,
            declaredFont: run.declaredFont,
            resolvedFamily: run.resolvedFamily,
            decoration: run.decoration,
            fontSize: run.fontSize,
          })),
          lines: runs.reduce((total, run) => total + (run.lineCount ?? 0), 0),
          // A snapshot from a render before GraphCompose 2.2.2 has none of this at
          // all, which is not the same as a region with no text.
          reported: true,
        };
      } else if (!model.hasTypography) {
        pkg.typography = { reported: false, note: "this render predates the engine that reports typography, so a font substitution here would be invisible" };
      }
    }
  }

  const verdict = classifyCause({
    pagination,
    displaced,
    tolerance,
    role: region.role ?? null,
    interiorPercent: regionStats ? regionStats.percent : null,
    substitutedFonts,
    regionRect: pkg.ownership?.referenceRect ?? null,
    typographyReported: Boolean(pkg.typography?.reported),
  });
  pkg.cause = verdict.cause;
  pkg.causeBasis = verdict.basis;
  pkg.causeCandidates = verdict.candidates;

  // A wrong asset compensated with margins is the specific failure item 23
  // exists to prevent, so the prohibition travels with the verdict rather than
  // living in a document the reader may not have open.
  if (verdict.cause === "ASSET") {
    pkg.recommendedProperties = [];
    pkg.prohibition = "Do not adjust margins, padding or size for this mismatch. Replace the asset.";
  }
  if (verdict.cause === "PAGINATION") {
    pkg.prohibition = "Do not act on any per-node measurement in this package until the page count matches.";
  }
  if (verdict.cause === "TYPOGRAPHY") {
    pkg.recommendedProperties = [];
    pkg.prohibition = "Do not adjust geometry for this mismatch. Name the font family the style meant, "
      + "and set the weight through the text style's decoration rather than by naming a face.";
  }
  if (owner && verdict.cause !== "GEOMETRY") {
    // Keeping the numbers is useful; presenting them as the fix is not.
    pkg.recommendedProperties = [];
  }

  return pkg;
}

/** The one-line summary a reviewer reads before deciding to open the rest. */
export function summarise(pkg) {
  const parts = [`${pkg.region.id}: ${pkg.cause}`];
  if (pkg.appearance?.percent != null) parts.push(`${pkg.appearance.percent}% of pixels differ`);
  if (pkg.layout?.displacement) {
    const { deltaX, deltaY } = pkg.layout.displacement;
    parts.push(`owner ${labelOf({ entityName: pkg.layout.name, entityKind: pkg.layout.kind })} is ${deltaX}pt across, ${deltaY}pt up from the reference region`);
  }
  return parts.join(" · ");
}
