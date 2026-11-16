/**
 * scripts/lib/container-fidelity.mjs — does the Java honour what the reference was measured to say?
 *
 * ## The gap this closes
 *
 * The barrier already refuses an analysis whose `fill.present` the reference
 * contradicts, and refuses a plan that leaves a measured container unclaimed.
 * Between those two there was nothing: the plan had to *name* the container,
 * and the code could then build it however it liked.
 *
 * It did. One run measured the competency cards correctly —
 *
 *     shapeOwnership.competency-pill.fill = { present: false }
 *
 * — and the template came back with
 *
 *     sec.addContainer(c -> {
 *         c.roundedRect(148, 21, 3.5);
 *         c.fillColor(DocumentColor.WHITE);
 *         c.stroke(DocumentStroke.of(CORAL_BORDER, 0.6));
 *
 * A white box painted over a peach sidebar, on the container whose measurement
 * says it paints nothing. Every gate passed. The measurement reached the code
 * and leaked back out of it.
 *
 * ## Attribution, and declining to guess
 *
 * A render method may build several containers, so finding a fill call in a
 * method proves nothing on its own. This attributes a construction to a
 * container two ways, in order:
 *
 *   1. the construction names it — `.name("competency-pill")`;
 *   2. the method builds exactly one container and claims exactly one.
 *
 * When neither holds and the method fills something, the finding says so and
 * asks for the name rather than picking a construction. Naming is cheap —
 * `name(String)` is on all three builders — and it is what makes the layout
 * snapshot addressable by the same id the analysis uses.
 *
 * ## A transparent fill is not a fill
 *
 * `fillColor(DocumentColor.rgba(0, 0, 0, 0))` appears in the corpus and is a
 * correct way to say "no fill". Flagging every `fillColor` call would report it
 * as a defect, so the argument is read: transparent, null and a zero-alpha rgba
 * are all no-ops.
 */

/** Calls that paint a container's interior. `fill(` is ShapeBuilder's paint overload. */
const FILL_CALL = /\.\s*fill(?:Color)?\s*\(/g;

/** How a container comes into being, in the forms the corpus writes. */
const CONSTRUCTOR = /\b(?:addContainer|addShape|addEllipse)\s*\(|\bnew\s+(?:ShapeContainerBuilder|ShapeBuilder|EllipseBuilder)\s*\(/g;

/** Arguments that paint nothing, whatever the call is named. */
function isNoOpFill(argument) {
  const text = String(argument);
  if (/\bnull\b/.test(text)) return true;
  if (/TRANSPARENT/i.test(text)) return true;
  // rgba(…, 0) — any alpha that is zero, however it is spaced.
  return /rgba\s*\([^)]*,\s*0(?:\.0+)?\s*\)/.test(text);
}

/** The text from the `(` at `open` to its matching `)`, inclusive. */
function parenSpan(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "(") depth += 1;
    else if (source[i] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

/** From a `new XBuilder(` to the statement's `;`, so a chained build is one span. */
function statementSpan(source, start) {
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const c = source[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    else if (c === ";" && depth <= 0) return source.slice(start, i);
  }
  return source.slice(start);
}

/**
 * Every container construction in a method body, with the name it declares.
 *
 * @param {string} body
 * @returns {Array<{text: string, name: string|null}>}
 */
export function constructions(body) {
  const out = [];
  const source = String(body ?? "");
  CONSTRUCTOR.lastIndex = 0;
  let hit;
  while ((hit = CONSTRUCTOR.exec(source)) !== null) {
    const isNew = hit[0].startsWith("new");
    const openAt = source.indexOf("(", hit.index);
    const text = isNew ? statementSpan(source, hit.index) : parenSpan(source, openAt);
    const named = /\.\s*name\s*\(\s*"([^"]*)"/.exec(text);
    out.push({ text, name: named ? named[1] : null });
  }
  return out;
}

/** Does this construction paint its interior with something visible? */
export function paintsFill(text) {
  const source = String(text ?? "");
  FILL_CALL.lastIndex = 0;
  let hit;
  while ((hit = FILL_CALL.exec(source)) !== null) {
    const open = source.indexOf("(", hit.index + hit[0].length - 1);
    if (!isNoOpFill(parenSpan(source, open))) return true;
  }
  return false;
}

/** A rectangle whose width AND height are both literal numbers: it cannot grow. */
const FIXED_RECT = /\.\s*(?:roundedRect|rectangle)\s*\(\s*[^,()]*?[0-9][^,()]*,\s*[0-9][0-9.]*\s*[,)]/;

/** Content laid over a shape at an offset, rather than flowed inside it. */
const OVERLAID = /\.\s*position\s*\(/;

/**
 * Report a container built so that its content cannot make it grow.
 *
 * A run measured the competency card as `fill-parent`, which is true of its
 * width, and built it as
 *
 *     c.roundedRect(144.0, 21.5, 2.5);
 *     c.position(pb.build(), 7.5, 0, LayerAlign.CENTER_LEFT);
 *
 * — a fixed box with its text laid on top at an offset. The longest label came
 * out as "Budgeting & Financial Managemen", clipped at the border, because text
 * placed over a shape cannot wrap and a shape given both dimensions cannot get
 * taller. The left inset is the literal 7.5 rather than padding.
 *
 * Nothing in the contract was broken, which is the point: `sizing` describes
 * the width only — "spans its parent's content width", "wraps its content" —
 * and no field asks what happens when the content needs a second line. So this
 * reads the code instead, where the answer is unambiguous: both dimensions
 * literal, and content positioned rather than flowed.
 *
 * `softPanel(color, radius, padding, stroke)` is the call that does grow. It is
 * on every flow builder, documented in the pack's own backgrounds-and-panels
 * guide, and named by no route and no contract — which is why a fixed rectangle
 * is what gets reached for.
 */
export function checkContainerGrowth({ shapeOwnership = [], componentMapping = [], source = "", readMethod }) {
  const findings = [];
  const methodFor = new Map();
  for (const entry of Array.isArray(componentMapping) ? componentMapping : []) {
    for (const container of entry?.containers ?? []) {
      if (typeof container === "string") methodFor.set(container, entry.renderMethod ?? null);
    }
  }

  for (const container of Array.isArray(shapeOwnership) ? shapeOwnership : []) {
    if (!container?.container) continue;
    // A container that hugs its content horizontally is a badge or a marker —
    // a fixed circle around an icon is the right shape for one, and holding it
    // would refuse the thing the field exists to describe.
    if (container.sizing !== "fill-parent") continue;
    // A repeat count of one is a panel, not a row of cards: the monogram panel
    // really is one fixed surface, and the label that overflows is the one that
    // repeats with different text each time.
    if (typeof container.repeats === "number" && container.repeats < 2) continue;

    const method = methodFor.get(container.container);
    if (!method) continue;
    const body = readMethod(source, method);
    if (body === null) continue;

    const built = constructions(body).find((c) => c.name === container.container)
      ?? (constructions(body).length === 1 ? constructions(body)[0] : null);
    if (!built) continue;
    if (!FIXED_RECT.test(built.text) || !OVERLAID.test(built.text)) continue;

    findings.push({
      kind: "container-cannot-grow",
      container: container.container,
      method,
      detail:
        `"${container.container}" repeats with different content and is built as a fixed box with its ` +
        "content positioned over it, so a label that needs a second line is clipped rather than wrapped — " +
        "softPanel(color, radius, padding, stroke) on the flow builder grows with what it holds, and its " +
        "padding is the inset rather than an offset",
    });
  }

  return findings;
}

/**
 * Report code that fills a container the reference was measured to leave unfilled.
 *
 * @param {object} input
 * @param {Array<object>} input.shapeOwnership measured containers
 * @param {Array<object>} input.componentMapping the plan's region -> method map
 * @param {string} input.source the generated template
 * @param {(source: string, method: string) => string|null} input.readMethod
 * @returns {Array<{kind: string, container: string, method: string|null, detail: string}>}
 */
export function checkContainerFills({ shapeOwnership = [], componentMapping = [], source = "", readMethod }) {
  const findings = [];
  const unfilled = (Array.isArray(shapeOwnership) ? shapeOwnership : []).filter(
    (c) => c?.container && c.fill && c.fill.present === false,
  );
  if (unfilled.length === 0) return findings;

  // Which method claims each container, and how many unfilled ones it claims —
  // the second is what makes "exactly one" attributable without a name.
  const methodFor = new Map();
  for (const entry of Array.isArray(componentMapping) ? componentMapping : []) {
    for (const container of entry?.containers ?? []) {
      if (typeof container === "string") methodFor.set(container, entry.renderMethod ?? null);
    }
  }

  for (const container of unfilled) {
    const method = methodFor.get(container.container);
    if (!method) continue; // the plan barrier already reports an unclaimed container
    const body = readMethod(source, method);
    if (body === null) continue; // method-not-found is a finding of its own

    const built = constructions(body);
    const byName = built.find((c) => c.name === container.container);
    const attributed =
      byName ??
      (built.length === 1 && unfilled.filter((c) => methodFor.get(c.container) === method).length === 1
        ? built[0]
        : null);

    if (attributed) {
      if (!paintsFill(attributed.text)) continue;
      findings.push({
        kind: "fill-contradicts-measurement",
        container: container.container,
        method,
        detail:
          `the reference measures "${container.container}" as unfilled, and ${method}() paints it — ` +
          "a fill matching the background is not the same as no fill: one paints, one lets the ground through",
      });
      continue;
    }

    // Could not say which construction is this container. Only worth reporting
    // when the method fills something, since otherwise there is nothing to
    // attribute either way.
    if (!built.some((c) => paintsFill(c.text))) continue;
    findings.push({
      kind: "fill-not-attributable",
      container: container.container,
      method,
      detail:
        `${method}() builds ${built.length} containers and paints at least one, and "${container.container}" ` +
        `is measured as unfilled — name the container in the builder (.name("${container.container}")) so the ` +
        "two can be checked against each other",
    });
  }

  return findings;
}
