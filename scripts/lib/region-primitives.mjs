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
 * ## Two ways to build a repeating band
 *
 * GraphCompose has two, and both are chrome:
 *
 *   DocumentHeaderFooter   `DocumentSession.header/footer(DocumentHeaderFooter)` —
 *                          three text slots and the {page}/{pages} tokens. Every
 *                          line has it.
 *   DocumentPageZone       `DocumentSession.chrome().zone(DocumentPageZone.footer(
 *                          height, page -> node))` — a node subtree per page: a
 *                          logo, a link, a row layout, `page.pageNumber()`.
 *                          From GraphCompose 2.3.
 *
 * This check used to know only the first, and asked for it with substrings:
 * `"footer("` and `"DocumentHeaderFooter"`. That rejected every zone-built
 * footer — the instruction it then printed told the agent to downgrade a band
 * with a logo to three strings — and it could not tell a header from a footer:
 * `DocumentHeaderFooter` is in both, so a footer registered from a page-header
 * region passed as a header. Detection below reads calls, not substrings, out
 * of source with comments and literals blanked, and knows which zone each call
 * registers.
 *
 * Signatures named below were verified against the 2.2–2.5 allow-lists
 * (`api-query --version <line> --type SessionChromeApi`, `DocumentPageZone`).
 */

/** The GraphCompose line DocumentPageZone and `SessionChromeApi.zone` arrived in. */
export const PAGE_ZONE_SINCE = "2.3";

/**
 * The two chrome mechanisms, by the id `visual-analysis.json` records on a
 * region (`chrome.mechanism`).
 */
export const CHROME_MECHANISMS = Object.freeze({
  "header-footer": Object.freeze({
    type: "DocumentHeaderFooter",
    register: (zone) => `DocumentSession.${zone}(DocumentHeaderFooter)`,
    since: null,
  }),
  "page-zone": Object.freeze({
    type: "DocumentPageZone",
    register: (zone) => `DocumentSession.chrome().zone(DocumentPageZone.${zone}(height, page -> node))`,
    since: PAGE_ZONE_SINCE,
  }),
});

/**
 * What to build instead, for the line the project is on.
 *
 * @param {"header"|"footer"} zone
 * @param {boolean|null} pageZones whether the pinned line has DocumentPageZone;
 *        null when the line could not be resolved
 * @returns {string}
 */
export function chromeInstead(zone, pageZones = null) {
  const text = CHROME_MECHANISMS["header-footer"].register(zone);
  const nodes = CHROME_MECHANISMS["page-zone"].register(zone);
  if (pageZones === false) {
    return `${text} — this GraphCompose line predates DocumentPageZone (${PAGE_ZONE_SINCE}), so text slots are the repeating band it has`;
  }
  const since = pageZones === true ? "" : ` (GraphCompose ${PAGE_ZONE_SINCE}+)`;
  return (
    `${text} for text slots and "Page {page} of {pages}", or ${nodes}${since} when the band ` +
    "carries a logo, a link, a row layout or styled numbering"
  );
}

/**
 * What each role forbids, and what at least one of it requires.
 *
 * `forbidden` is where certainty is highest — a footer that bleeds to the paper
 * edge is not a footer, whatever else it does. `requiresAnyOf` is deliberately
 * short and names only calls the allow-list confirms exist. The page roles
 * carry `chrome` instead: what they require is a registration of that zone,
 * which `chromeRegistrations` reads rather than a substring.
 */
export const ROLE_CONTRACT = Object.freeze({
  "page-footer": {
    forbidden: ["bleedToEdge"],
    requiresAnyOf: [],
    chrome: "footer",
    because:
      "a footer is chrome the engine reserves a band for and repeats on every page. " +
      "bleedToEdge extends a fill past the margin to the paper edge, which is the " +
      "opposite of a reserved band, and a body-drawn footer appears on page one only",
    instead: chromeInstead("footer"),
  },
  "page-header": {
    forbidden: ["bleedToEdge"],
    requiresAnyOf: [],
    chrome: "header",
    because:
      "a header repeats on every page. Drawn as body content it appears once, at the " +
      "top of page one, and the continuation pages lose it",
    instead: chromeInstead("header"),
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
 * Java source with comments and string, char and text-block literals blanked.
 *
 * A footer whose text is `"see footer("` or a comment reading
 * `// not DocumentHeaderFooter` is not a registration, and a check that reads
 * calls has to stop reading words first.
 *
 * @param {string} source
 * @returns {string}
 */
export function codeOnly(source) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      out += " ";
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
      out += " ";
    } else if (c === '"' && source.startsWith('"""', i)) {
      const end = source.indexOf('"""', i + 3);
      i = end === -1 ? source.length : end + 3;
      out += '""';
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== c && source[j] !== "\n") {
        if (source[j] === "\\") j += 1;
        j += 1;
      }
      i = j + 1;
      out += c + c;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** The text between an opening parenthesis and its partner, exclusive. */
function balancedArgument(code, openIndex) {
  let depth = 0;
  for (let k = openIndex; k < code.length; k += 1) {
    if (code[k] === "(") depth += 1;
    else if (code[k] === ")") {
      depth -= 1;
      if (depth === 0) return code.slice(openIndex + 1, k);
    }
  }
  return code.slice(openIndex + 1);
}

/**
 * The rest of a builder chain from `start`: up to the `;`, `,` or unmatched `)`
 * that ends the expression it belongs to.
 */
function chainExtent(code, start) {
  let depth = 0;
  for (let k = start; k < code.length; k += 1) {
    const c = code[k];
    if (c === "(" || c === "{" || c === "[") depth += 1;
    else if (c === ")" || c === "}" || c === "]") {
      if (depth === 0) return code.slice(start, k);
      depth -= 1;
    } else if ((c === ";" || c === ",") && depth === 0) return code.slice(start, k);
  }
  return code.slice(start);
}

const ZONE_CONSTANT = /\bDocumentHeaderFooterZone\s*\.\s*(HEADER|FOOTER)\b/;

/**
 * What an argument stands for: the argument itself, plus the initializer of a
 * local it names or the body of a helper it calls. One level, on purpose — a
 * footer built in `footerZone(spec)` and registered with
 * `.zone(footerZone(spec))` is the shape templates actually have; chasing
 * further is guessing.
 */
function resolveArgument(arg, code, fullCode) {
  const trimmed = arg.trim();
  const identifier = /^[A-Za-z_$][\w$]*$/.exec(trimmed);
  if (identifier) {
    const declaration = new RegExp(`\\b[\\w.<>]+\\s+${trimmed}\\s*=`).exec(code) ??
      new RegExp(`\\b[\\w.<>]+\\s+${trimmed}\\s*=`).exec(fullCode);
    if (declaration) {
      const haystack = declaration.input;
      return `${trimmed} ${declaration[0]} ${chainExtent(haystack, declaration.index + declaration[0].length)}`;
    }
    return trimmed;
  }
  const call = /^([A-Za-z_$][\w$]*)\s*\(/.exec(trimmed);
  if (call) {
    const body = methodBody(fullCode, call[1]);
    if (body) return `${trimmed} ${body}`;
  }
  return trimmed;
}

/**
 * Every repeating band a method body registers or builds, and which zone.
 *
 *   DocumentPageZone.footer(h, page -> …)        page-zone   footer
 *   DocumentPageZone.builder().zone(…HEADER)…    page-zone   header
 *   chrome().zone(footerZone(spec))              page-zone   (from the helper)
 *   session.footer(DocumentHeaderFooter.builder()…)   header-footer   footer
 *   chrome().header(banner)                      header-footer   header
 *   DocumentHeaderFooter.builder().zone(…FOOTER) header-footer   footer
 *
 * `.header(` / `.footer(` count as a session registration only when what they
 * are given is a DocumentHeaderFooter (or the receiver is `chrome()`): a
 * table's `header(...)` is not a page header, and `renderFooter(` is a call to
 * a method that happens to be named so.
 *
 * @param {string} body the method body
 * @param {string} [source] the whole template, for locals and helpers
 * @returns {Array<{mechanism: "header-footer"|"page-zone", zone: "header"|"footer"|null}>}
 */
export function chromeRegistrations(body, source = body) {
  const code = codeOnly(body);
  const fullCode = codeOnly(source);
  const found = [];
  const add = (mechanism, zone) => {
    if (!found.some((f) => f.mechanism === mechanism && f.zone === zone)) found.push({ mechanism, zone });
  };

  const scanZones = (text) => {
    for (const hit of text.matchAll(/\bDocumentPageZone\s*\.\s*(header|footer)\s*\(/g)) {
      add("page-zone", hit[1]);
    }
    for (const hit of text.matchAll(/\bDocumentPageZone\s*\.\s*builder\s*\(\s*\)/g)) {
      const zone = ZONE_CONSTANT.exec(chainExtent(text, hit.index + hit[0].length));
      add("page-zone", zone ? zone[1].toLowerCase() : null);
    }
  };
  scanZones(code);

  // Where `.header(` / `.footer(` hand a value to the session. A
  // DocumentHeaderFooter built inside one of these takes the zone of the call,
  // not of its builder, so its own `.zone(...)` must not be read as a second band.
  const registrationSpans = [];

  for (const hit of code.matchAll(/\.\s*(header|footer|zone)\s*\(/g)) {
    const receiver = code.slice(Math.max(0, hit.index - 40), hit.index);
    if (/\bDocumentPageZone\s*$/.test(receiver)) continue; // the factory, scanned above
    const open = hit.index + hit[0].length - 1;
    const arg = balancedArgument(code, open);
    const resolved = resolveArgument(arg, code, fullCode);
    const onChrome = /\bchrome\s*\(\s*\)\s*$/.test(receiver);

    if (hit[1] === "zone") {
      // `.zone(DocumentHeaderFooterZone.FOOTER)` is a builder setter, not a
      // registration; a registration hands over a DocumentPageZone.
      if (/^\s*DocumentHeaderFooterZone\s*\./.test(arg)) continue;
      if (/\bDocumentPageZone\b/.test(resolved)) {
        const before = found.length;
        scanZones(resolved);
        if (found.length === before && !found.some((f) => f.mechanism === "page-zone")) {
          add("page-zone", null);
        }
      }
      continue;
    }

    const name = arg.trim();
    const declaredType =
      /^[A-Za-z_$][\w$]*$/.test(name) && new RegExp(`\\bDocumentHeaderFooter\\s+${name}\\b`).test(fullCode);
    if (onChrome || (name !== "" && (/\bDocumentHeaderFooter\b/.test(resolved) || declaredType))) {
      // The method decides the zone: DocumentSession.footer(...) re-zones what
      // it is given, whatever the builder said.
      add("header-footer", hit[1]);
      registrationSpans.push([open, open + arg.length + 1]);
    }
  }

  // A DocumentHeaderFooter built and returned rather than registered — a helper
  // the plan maps a region to. Its builder's zone constant is the only thing
  // that says which band it is.
  for (const hit of code.matchAll(/\bDocumentHeaderFooter\s*\.\s*builder\s*\(\s*\)/g)) {
    if (registrationSpans.some(([from, to]) => hit.index > from && hit.index < to)) continue;
    const zone = ZONE_CONSTANT.exec(chainExtent(code, hit.index + hit[0].length));
    add("header-footer", zone ? zone[1].toLowerCase() : null);
  }
  return found;
}

/**
 * Check every mapped region against the contract for its role.
 *
 * `pageZones` is whether the project's GraphCompose line has DocumentPageZone:
 * true or false when the pinned pack answered, null when nothing resolved the
 * line. It changes two things — what the fix names, and whether a zone-built
 * band is a build for this line or a call that will not compile.
 *
 * @param {{regions: Array<object>, componentMapping: Array<object>, source: string, pageZones?: boolean|null, graphComposeLine?: string|null}} input
 * @returns {Array<{kind: string, region: string, role: string|null, method: string|null, detail: string}>}
 */
export function checkRegionPrimitives({
  regions = [],
  componentMapping = [],
  source = "",
  pageZones = null,
  graphComposeLine = null,
}) {
  const findings = [];
  const mappingFor = new Map(componentMapping.map((entry) => [entry.region, entry]));
  const roleFor = new Map(regions.map((region) => [region.id, region.role ?? null]));

  // Whether the method exists is not a question about the role. It used to be
  // asked only for roles carrying a build contract, so luma's `parties` — role
  // `content`, deliberately unconstrained — mapped to `renderParties()` for six
  // revisions while the source declared `renderParty(…)`, and this check
  // reported "each is built the way its role says" every time. The plan is the
  // link the whole review follows; an entry pointing at nothing breaks the link
  // whatever the region is for, and it is what publishes a bundle flat later.
  const reported = new Set();
  for (const entry of componentMapping) {
    if (!entry || typeof entry.renderMethod !== "string" || entry.renderMethod === "") continue;
    const key = `${entry.region}::${entry.renderMethod}`;
    if (reported.has(key)) continue;
    if (methodBody(source, entry.renderMethod) !== null) continue;
    reported.add(key);
    findings.push({
      kind: "method-not-found",
      region: entry.region ?? null,
      role: roleFor.get(entry.region) ?? null,
      method: entry.renderMethod,
      detail: `the plan maps this region to ${entry.renderMethod}(), which the template does not define`,
    });
  }

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

    // Already reported by the pass above, which asks it of every mapping rather
    // than only of the roles that carry a contract.
    const rawBody = methodBody(source, mapping.renderMethod);
    if (rawBody === null) continue;
    // Calls, not words: a comment or a string naming a primitive is not a use of it.
    const body = codeOnly(rawBody);

    for (const banned of contract.forbidden) {
      if (body.includes(banned)) {
        findings.push({
          kind: "forbidden-primitive",
          region: region.id,
          role,
          method: mapping.renderMethod,
          detail:
            `${mapping.renderMethod}() builds a ${role} with ${banned} — ${contract.because}. ` +
            `Use ${contract.chrome ? chromeInstead(contract.chrome, pageZones) : contract.instead}`,
        });
      }
    }

    if (contract.chrome) {
      findings.push(
        ...checkChrome({ region, role, contract, method: mapping.renderMethod, body: rawBody, source, pageZones, graphComposeLine }),
      );
      continue;
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

/**
 * A page-header or page-footer region: is its zone registered, through a
 * mechanism this line has, and the one the analysis chose?
 */
function checkChrome({ region, role, contract, method, body, source, pageZones, graphComposeLine }) {
  const zone = contract.chrome;
  const other = zone === "footer" ? "header" : "footer";
  const declared = region.chrome?.mechanism ?? null;
  const line = graphComposeLine ? `GraphCompose ${graphComposeLine}` : "this GraphCompose line";
  const at = (kind, detail) => ({ kind, region: region.id, role, method, detail });
  const findings = [];

  const registrations = chromeRegistrations(body, source);
  let usable = registrations;

  if (pageZones === false && registrations.some((r) => r.mechanism === "page-zone")) {
    findings.push(
      at(
        "primitive-unavailable",
        `${method}() builds the ${zone} with DocumentPageZone, which ${line} does not have — ` +
          `it arrived in GraphCompose ${PAGE_ZONE_SINCE} and will not compile here. ` +
          `Use ${chromeInstead(zone, false)}, or move the pin to ${PAGE_ZONE_SINCE}+`,
      ),
    );
    usable = registrations.filter((r) => r.mechanism !== "page-zone");
  }

  const ofZone = usable.filter((r) => r.zone === zone);
  if (!ofZone.length) {
    const wrongZone = usable.some((r) => r.zone === other);
    findings.push(
      wrongZone
        ? at(
            "wrong-zone",
            `${method}() registers a page ${other}, and the region is ${role} — the band would ` +
              `repeat at the ${other === "header" ? "top" : "foot"} of every page instead. ` +
              `Use ${chromeInstead(zone, pageZones)}`,
          )
        : at(
            "missing-primitive",
            `${method}() builds a ${role} without registering a page ${zone} — ${contract.because}. ` +
              `Use ${chromeInstead(zone, pageZones)}`,
          ),
    );
    return findings;
  }

  if (declared === "page-zone" && pageZones === false) {
    findings.push(
      at(
        "primitive-unavailable",
        `the analysis chose DocumentPageZone for this ${zone}, which ${line} does not have ` +
          `(GraphCompose ${PAGE_ZONE_SINCE}+). Record header-footer, and name what three text ` +
          "slots cannot carry in unclearParts — or move the pin",
      ),
    );
    return findings;
  }

  if (declared && CHROME_MECHANISMS[declared] && !ofZone.some((r) => r.mechanism === declared)) {
    const chosen = CHROME_MECHANISMS[declared];
    findings.push(
      at(
        "mechanism-mismatch",
        `the analysis chose ${chosen.type} for this ${zone}` +
          (region.chrome?.reason ? ` ("${region.chrome.reason}")` : "") +
          `, and ${method}() builds it with ${CHROME_MECHANISMS[ofZone[0].mechanism].type}. ` +
          (declared === "page-zone"
            ? "Text slots cannot carry a logo, a link or a layout; build it as " + chosen.register(zone)
            : "Either record why the band needs nodes, or build it as " + chosen.register(zone)),
      ),
    );
  }
  return findings;
}
