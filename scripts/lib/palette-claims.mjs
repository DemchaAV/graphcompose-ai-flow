/**
 * scripts/lib/palette-claims.mjs — the palette's prose against the measured containers.
 *
 * ## The failure
 *
 * One analysis said both of these, and validated:
 *
 *     shapeOwnership.competency-pill.fill = { present: false }
 *     colors[page-bg].usedIn = "main content area background, competency boxes fill"
 *
 * The structured field was right — the cards paint nothing, the peach sidebar
 * shows through them. The prose was wrong, and the prose is what authoring
 * believed: the template came back with `fillColor(DocumentColor.WHITE)` on
 * that container, which was the first thing a reader noticed about the render.
 *
 * The model did not change its mind halfway through. The contradiction was in
 * the artifact from the first write, and nothing looked at the two fields
 * together. `usedIn` even carries the disclaimer "Descriptive, not decided on"
 * in its own schema description, which is exactly the kind of note that does
 * not survive contact with a document being built from it.
 *
 * ## What this matches, and what it deliberately does not
 *
 * Prose matching earns suspicion, so this is built to be quiet. A clause is
 * held only when both halves land: every *distinctive* word of a container's
 * id appears in it, and the clause says "fill". Generic nouns — box, card,
 * pill, panel — are dropped from the container id before matching, so a colour
 * has to name the thing rather than its shape.
 *
 * "background" and "behind" are deliberately not fill words even though they
 * often mean one. They appear in honest prose constantly — "sidebar background
 * surface" is a correct sentence about a real fill — and a check that fires on
 * correct sentences is a check somebody turns off. The word that carried the
 * actual defect was "fill", and that is the word this looks for.
 *
 * The consequence is real and worth stating: this catches the case that has
 * happened and will miss paraphrases of it. It is a contradiction detector,
 * not a prose critic.
 */

/** Shape nouns that say what a container looks like rather than which one it is. */
const GENERIC = new Set([
  "area",
  "badge",
  "block",
  "box",
  "card",
  "chip",
  "container",
  "item",
  "marker",
  "panel",
  "pill",
  "region",
  "row",
  "shape",
  "surface",
  "tile",
]);

/** Only this family. See the note above on why "background" is not here. */
const FILL_WORDS = new Set(["fill", "filled", "fills"]);

/** Crude singular, enough to tie "competency" to "competencies" and "box" to "boxes". */
export function stem(word) {
  const lower = String(word).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (lower.endsWith("ies")) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith("es") && lower.length > 4) return lower.slice(0, -2);
  if (lower.endsWith("s") && lower.length > 3) return lower.slice(0, -1);
  return lower;
}

/** The words of a container id that identify it, with the shape nouns removed. */
export function distinctiveTokens(container) {
  return String(container ?? "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(stem)
    .filter((token) => token && !GENERIC.has(token));
}

/** `usedIn` is a string, a list, or absent; the corpus writes all three. */
export function clausesOf(usedIn) {
  const list = Array.isArray(usedIn) ? usedIn : typeof usedIn === "string" ? usedIn.split(/[;,]/) : [];
  return list.map((c) => String(c).trim()).filter(Boolean);
}

/** Does this clause claim something is filled? */
export function claimsFill(clause) {
  return String(clause)
    .split(/[^A-Za-z0-9]+/)
    .some((word) => FILL_WORDS.has(word.toLowerCase()));
}

/** Does this clause name that container? Every distinctive word has to be in it. */
export function namesContainer(clause, tokens) {
  if (tokens.length === 0) return false;
  const words = new Set(
    String(clause)
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map(stem),
  );
  return tokens.every((token) => words.has(token));
}

/**
 * Hold a palette clause that claims a fill on a container measured as unfilled.
 *
 * @param {object} input
 * @param {Array<object>} input.colors the analysis's `colors`
 * @param {Array<object>} input.shapeOwnership the analysis's containers
 * @returns {{held: string[], checked: number}}
 */
export function auditPalette({ colors = [], shapeOwnership = [] }) {
  const unfilled = (Array.isArray(shapeOwnership) ? shapeOwnership : [])
    .filter((c) => c?.container && c.fill && c.fill.present === false)
    .map((c) => ({ container: c.container, tokens: distinctiveTokens(c.container) }))
    // A container whose id is all shape nouns cannot be attributed to a clause
    // with any confidence, and guessing is what this exists to stop.
    .filter((c) => c.tokens.length > 0);

  const held = [];
  if (unfilled.length === 0) return { held, checked: 0 };

  for (const colour of Array.isArray(colors) ? colors : []) {
    for (const clause of clausesOf(colour?.usedIn)) {
      if (!claimsFill(clause)) continue;
      for (const { container, tokens } of unfilled) {
        if (!namesContainer(clause, tokens)) continue;
        held.push(
          `"${container}" is measured as unfilled, and the colour "${colour.role ?? colour.value}" ` +
            `claims it is filled: ${JSON.stringify(clause)} — one of the two is wrong, ` +
            "and authoring builds from whichever it reads first",
        );
      }
    }
  }

  return { held, checked: unfilled.length };
}
