/**
 * scripts/lib/region-primitives.mjs — a region's role decides how it may be built.
 *
 * `visual-analysis.schema.json` has always said this, in the description of the
 * `role` field: page-header and page-footer "must map to DocumentSession.header
 * /.footer … never be drawn as body content". The knowledge was there. Two
 * things stopped it from doing anything:
 *
 *   1. `role` was optional, so nothing wrote it. A real proposal run named a
 *      region `page-footer`, labelled it "Footer band", and left `role` unset —
 *      on that region and on all thirteen others.
 *   2. Nothing read it. One consumer looked at `table-header`; nobody looked at
 *      page-footer, and no step compared the role against what the template
 *      actually did.
 *
 * So the footer was built with `bleedToEdge(BOTTOM)`, which extends a fill past
 * the margin to the paper edge — the opposite of a reserved band — and flooded
 * the page. The review caught it afterwards, by eye, as
 * `footer-bleed-floods-page`. Afterwards is the expensive place to catch it: the
 * layout was already built around it.
 *
 * This compares the two artifacts that already exist. `architecture-plan.json`
 * maps every region to one named render method; the generated template contains
 * those methods. Reading which primitives a method reaches for and checking them
 * against the region's role is arithmetic, not judgement.
 *
 * Every signature named below was verified against the 2.2 allow-list.
 */

/**
 * What each role forbids, and what at least one of it requires.
 *
 * `forbidden` is where certainty is highest — a footer that bleeds to the paper
 * edge is not a footer, whatever else it does. `requiresAnyOf` is deliberately
 * short and names only calls the allow-list confirms exist.
 */
export const ROLE_CONTRACT = Object.freeze({
  "page-footer": {
    forbidden: ["bleedToEdge"],
    requiresAnyOf: ["footer(", "DocumentHeaderFooter"],
    because:
      "a footer is chrome the engine reserves a band for and repeats on every page. " +
      "bleedToEdge extends a fill past the margin to the paper edge, which is the " +
      "opposite of a reserved band, and a body-drawn footer appears on page one only",
    instead: "DocumentSession.footer(DocumentHeaderFooter)",
  },
  "page-header": {
    forbidden: ["bleedToEdge"],
    requiresAnyOf: ["header(", "DocumentHeaderFooter"],
    because:
      "a header repeats on every page. Drawn as body content it appears once, at the " +
      "top of page one, and the continuation pages lose it",
    instead: "DocumentSession.header(DocumentHeaderFooter)",
  },
  "table-header": {
    forbidden: [],
    requiresAnyOf: ["repeatHeader", "headerRow", "header("],
    because:
      "a table's header repeats at the top of every page the table reaches; without " +
      "it the continuation pages carry unlabelled columns",
    instead: "TableBuilder.repeatHeader()",
  },
  table: {
    forbidden: [],
    requiresAnyOf: ["addTable"],
    because:
      "a table drawn as rows of shapes has no columns to align, no header to repeat " +
      "and no way to break across a page",
    instead: "AbstractFlowBuilder.addTable(Consumer<TableBuilder>)",
  },
  image: {
    // ImageBuilder is here because addImage cannot reach every place an image
    // belongs. A photograph clipped to a circle is the shape container's child,
    // handed to .center(DocumentNode) — there is no addImage overload that
    // returns a node, so the only route is `new ImageBuilder()...build()`. That
    // is the same ImageNode addImage would have produced, and refusing it would
    // push a real picture back towards a coloured disc, which is the failure
    // this rule exists to prevent.
    forbidden: [],
    requiresAnyOf: ["addImage", "ImageBuilder"],
    because: "a filled rectangle standing in for a picture matches its box and nothing inside it",
    instead: "addImage(...) — or new ImageBuilder()…build() where the image is a shape's child",
  },
  icon: {
    forbidden: [],
    requiresAnyOf: ["addSvgIcon", "inlineSvgIcon", "addImage", "ImageBuilder"],
    because: "a disc standing in for an icon is the right colour in the right place and empty",
    instead:
      "addSvgIcon(SvgIcon, double), or inlineSvgIcon(...) where the icon rides a text " +
      "baseline — or addImage for a raster fallback",
  },
});

/** Roles the contract says nothing about; listed so a reader knows it is deliberate. */
export const UNCONSTRAINED_ROLES = Object.freeze(["content", "background", "panel", "divider"]);

/**
 * The body of a named method, by brace matching from its signature.
 *
 * Regex alone cannot do this: a method body contains braces, and the lambdas
 * GraphCompose is built from contain many. Returns null when the method is not
 * there, which is itself a finding rather than a reason to guess.
 *
 * @param {string} source Java source
 * @param {string} methodName
 * @returns {string|null}
 */
export function methodBody(source, methodName) {
  const signature = new RegExp(`\\b${methodName}\\s*\\(`, "g");
  let hit;
  while ((hit = signature.exec(source)) !== null) {
    // The opening brace of the body, if this occurrence is a declaration rather
    // than a call: scan forward past the parameter list.
    let i = hit.index + hit[0].length - 1;
    let depth = 0;
    for (; i < source.length; i += 1) {
      if (source[i] === "(") depth += 1;
      else if (source[i] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    // Between the parameter list and the body there may be `throws X`, spaces
    // and newlines — but a `;` means this was a call or an abstract declaration.
    let j = i + 1;
    while (j < source.length && /[\s\w,.<>[\]]/.test(source[j])) {
      if (source[j] === ";") break;
      j += 1;
    }
    if (source[j] !== "{") continue;

    let braces = 0;
    for (let k = j; k < source.length; k += 1) {
      if (source[k] === "{") braces += 1;
      else if (source[k] === "}") {
        braces -= 1;
        if (braces === 0) return source.slice(j, k + 1);
      }
    }
  }
  return null;
}

/**
 * Check every mapped region against the contract for its role.
 *
 * @param {{regions: Array<object>, componentMapping: Array<object>, source: string}} input
 * @returns {Array<{kind: string, region: string, role: string|null, method: string|null, detail: string}>}
 */
export function checkRegionPrimitives({ regions = [], componentMapping = [], source = "" }) {
  const findings = [];
  const mappingFor = new Map(componentMapping.map((entry) => [entry.region, entry]));

  for (const region of regions) {
    const role = region.role ?? null;

    if (!role) {
      // Not a nag about a missing field: without a role there is nothing to
      // check, so an unroled region is a hole in the contract, not a pass.
      findings.push({
        kind: "role-missing",
        region: region.id,
        role: null,
        method: mappingFor.get(region.id)?.renderMethod ?? null,
        detail:
          `"${region.label ?? region.id}" states no role, so how it may be built was never ` +
          "decided and cannot be checked",
      });
      continue;
    }

    const contract = ROLE_CONTRACT[role];
    if (!contract) continue; // deliberately unconstrained

    const mapping = mappingFor.get(region.id);
    if (!mapping) {
      findings.push({
        kind: "region-not-mapped",
        region: region.id,
        role,
        method: null,
        detail: `role ${role} carries a build contract, and no component maps this region to a render method`,
      });
      continue;
    }

    const body = methodBody(source, mapping.renderMethod);
    if (body === null) {
      findings.push({
        kind: "method-not-found",
        region: region.id,
        role,
        method: mapping.renderMethod,
        detail: `the plan maps this region to ${mapping.renderMethod}(), which the template does not define`,
      });
      continue;
    }

    for (const banned of contract.forbidden) {
      if (body.includes(banned)) {
        findings.push({
          kind: "forbidden-primitive",
          region: region.id,
          role,
          method: mapping.renderMethod,
          detail:
            `${mapping.renderMethod}() builds a ${role} with ${banned} — ${contract.because}. ` +
            `Use ${contract.instead}`,
        });
      }
    }

    if (contract.requiresAnyOf.length && !contract.requiresAnyOf.some((call) => body.includes(call))) {
      findings.push({
        kind: "missing-primitive",
        region: region.id,
        role,
        method: mapping.renderMethod,
        detail:
          `${mapping.renderMethod}() builds a ${role} without any of ` +
          `${contract.requiresAnyOf.join(", ")} — ${contract.because}. Use ${contract.instead}`,
      });
    }
  }

  return findings;
}
