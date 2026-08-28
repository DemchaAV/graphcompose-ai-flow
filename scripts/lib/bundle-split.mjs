/**
 * scripts/lib/bundle-split.mjs — which member of a generated template belongs
 * in which file of the published bundle.
 *
 * ## Why this exists
 *
 * The iteration loop wants one file. `source.mjs`, `check-structural-smells`,
 * `restore-component` and the render runner's antrun copy all address a single
 * `generated-template.java`, and reading one method out of it is cheaper than
 * opening six. The person handed the *published bundle* wants the opposite: a
 * project whose structure is the document's structure, where "make the pricing
 * section more compact" opens one 60-line file instead of scrolling a thousand.
 *
 * Both are right, for different readers. So the split happens once, at publish,
 * and this module is the part that decides where everything goes.
 *
 * ## What makes it deterministic
 *
 * Nothing here guesses, and nothing here may ask a model — `bundle-project.mjs`
 * sets that rule for the whole zero-token half of the lifecycle and it applies
 * to publishing too. The classification comes from three facts the source
 * already carries:
 *
 *   - the harness's own invariant that every visible region is one named render
 *     method, so `render*` *is* the section list;
 *   - `architecture-plan.json`'s `componentMapping`, when the revision has one,
 *     which names those regions better than a method name can;
 *   - Java itself: a helper's first parameter says whether it draws (a builder)
 *     or computes (anything else), and the call graph says whether it is shared.
 *
 * ## What it refuses
 *
 * A generated template has no instance state — verified across every
 * flow-generated bundle. `templates/invoice-classic` does have some (a
 * constructor and a `private final BusinessTheme`), because it was not generated
 * by this flow, and a splitter that tried anyway would emit Java that does not
 * compile at the exact moment a user said "approve". So anything unfamiliar is a
 * named refusal and the publisher falls back to the flat layout.
 *
 * This module is pure: it reads a string and returns a description. Emitting the
 * files is `emit()`'s job, and writing them is the publisher's.
 */

/** Builder types whose presence as a first parameter means "this draws". */
const BUILDER_TYPES = new Set([
  "DocumentSession",
  "SectionBuilder",
  "RowBuilder",
  "ParagraphBuilder",
  "TableBuilder",
  "TimelineBuilder",
  "TimelineEntryBuilder",
  "LayerStackBuilder",
  "ShapeContainerBuilder",
  "ImageBuilder",
  "ListBuilder",
  "AbstractFlowBuilder",
]);

/**
 * Return types that mean "this produced a piece of the page".
 *
 * A helper does not have to take a builder to be a visual composite:
 * `marker(int index)` returns a `DocumentNode` and is as much a drawn thing as
 * anything that appends to a section.
 */
const NODE_TYPES = new Set([
  "DocumentNode",
  "ParagraphNode",
  "SectionNode",
  "RowNode",
  "TableNode",
  "ImageNode",
  "DocumentTableCell",
  "DocumentTableColumn",
]);

/**
 * Return types that mean "this produced a design token".
 *
 * `textStyle(size, colour, bold)` is typography, and typography belongs beside
 * the palette rather than in a bag of utilities.
 */
const STYLE_TYPES = new Set([
  "DocumentTextStyle",
  "DocumentColor",
  "DocumentInsets",
  "DocumentStroke",
  "DocumentCornerRadius",
  "DocumentTableStyle",
]);

/**
 * Field types that are never design tokens, however constant they look.
 *
 * `REVISION_DIR` is a `Path` read from a system property. It is infrastructure
 * that happens to be `static final`, and filing it under "theme" would put the
 * harness's data-directory lookup in the same file as the palette.
 */
const NON_THEME_TYPES = new Set(["Path", "File", "InputStream"]);

const CLASS_DECL = /^\s*(?:(?:public|private|protected|static|final|abstract|sealed)\s+)*(class|interface|record|enum)\s+(\w+)/;
const METHOD_DECL = /^\s*(?:(?:public|private|protected|static|final|abstract|synchronized|native)\s+)*([\w.<>,?\[\]\s]+?)\s+(\w+)\s*\(([^;{]*)\)\s*(?:throws\s+[\w.,\s]+)?\{/;
// The type has to admit a space: `Map<String, IconAsset> ICONS` is one
// declaration, and a character class without one silently skipped it — the
// icon manifest then belonged to no file at all.
const FIELD_DECL = /^\s*(?:(public|private|protected)\s+)?(static\s+)?(final\s+)?([\w.\[\]]+(?:\s*<[^>]*>)?(?:\[\])?)\s+(\w+)\s*(=|;)/;
const STATEMENT_HEAD = /^\s*(if|for|while|switch|catch|try|else|do|return|new|throw|synchronized)\b/;

/**
 * Where every member of a generated template belongs.
 *
 * @param {string} source the template's Java source
 * @param {{plan?: object|null, className?: string|null}} [options]
 *   `plan` is a parsed `architecture-plan.json`; absent is normal and handled.
 * @returns {{
 *   feasible: boolean,
 *   reason: string|null,
 *   className: string|null,
 *   theme: Array<object>,
 *   support: Array<object>,
 *   sections: Array<object>,
 *   composites: Array<object>,
 *   template: Array<object>,
 * }}
 */
export function classify(source, options = {}) {
  const plan = options.plan ?? null;
  const parsed = parse(source);

  if (parsed.reason) return refusal(parsed.reason, parsed.className);

  const { className, fields, methods, nestedTypes } = parsed;

  // --- feasibility -----------------------------------------------------------

  const instanceField = fields.find((f) => !f.static);
  if (instanceField) {
    return refusal(`instance field: ${instanceField.name}`, className);
  }

  const constructor = methods.find((m) => m.name === className);
  if (constructor) return refusal(`constructor: ${className}(…)`, className);

  const unbalanced = [...methods, ...nestedTypes].find((m) => !m.balanced);
  if (unbalanced) {
    return refusal(`unbalanced declaration: ${unbalanced.name}`, className);
  }

  const foreignType = nestedTypes.find((t) => t.kind !== "record");
  if (foreignType) {
    return refusal(`nested ${foreignType.kind}: ${foreignType.name}`, className);
  }

  // The public surface stays where a consumer expects to find it. `compose` has
  // an overload on the invoice lane, and a template implementing the canonical
  // interface also carries `getTemplateId` / `getTemplateName` / `getDescription`
  // — all of them public, none of them a section. Classifying by shape alone
  // filed the second `compose` under composites as a class called `Compose`.
  const publicApi = methods.filter((m) => m.public);
  if (!publicApi.some((m) => m.name === "compose")) {
    return refusal("no public compose(…) method", className);
  }

  // --- sections --------------------------------------------------------------

  const byName = new Map(methods.map((m) => [m.name, m]));
  const declared = declaredSections(plan);

  const missing = declared.find((d) => !byName.has(d.renderMethod));
  if (missing) {
    return refusal(
      `architecture-plan names ${missing.renderMethod}, which the source does not declare`,
      className,
    );
  }

  // The plan enriches; it does not select. `componentMapping` names the regions
  // a reviewer cares about and says why each is built the way it is, but it is
  // written by hand and it misses the containers — `renderSidebar` and
  // `renderMainColumn` are absent from charcoal-gold's. Treating the plan as the
  // whole list demoted those two to "composites" called `RenderSidebar`, which
  // is neither a composite nor a name. The naming rule the harness actually
  // enforces is the method prefix, so that is the list, and the plan supplies
  // the better name and the reasoning for the entries it does cover.
  const declaredByMethod = new Map(declared.map((d) => [d.renderMethod, d]));
  const sections = methods
    .filter((m) => !m.public)
    .filter((m) => /^render[A-Z]/.test(m.name) || declaredByMethod.has(m.name))
    .map((m) => {
      const declaredEntry = declaredByMethod.get(m.name) ?? null;
      const region = declaredEntry ? declaredEntry.region : null;
      return {
        ...m,
        region,
        notes: declaredEntry ? declaredEntry.notes : null,
        typeName: sectionType(region ? pascal(region) : renderStem(m.name)),
      };
    });

  if (sections.length === 0) return refusal("no render* methods to split on", className);

  const sectionNames = new Set(sections.map((s) => s.name));

  // --- helpers: composite, section-local, or support -------------------------

  const callers = callGraph(source, methods);
  const composites = [];
  const support = [];
  const themeMethods = [];
  const template = [...publicApi];

  for (const method of methods) {
    if (method.public || sectionNames.has(method.name)) continue;

    const called = callers.get(method.name) ?? new Set();
    const callingSections = [...called].filter((name) => sectionNames.has(name));

    if (makesToken(method)) {
      themeMethods.push(method);
      continue;
    }
    if (!drawsInto(method)) {
      support.push(method);
      continue;
    }
    // Used by exactly one section and by nothing else: it is that section's
    // private detail, and giving it a file of its own is the fragmentation the
    // brief explicitly rules out ("не дробить код ради дробления").
    if (callingSections.length === 1 && called.size === 1) {
      const owner = sections.find((s) => s.name === callingSections[0]);
      owner.local = owner.local ?? [];
      owner.local.push(method);
      continue;
    }
    composites.push({ ...method, typeName: pascal(method.name) });
  }

  // Fields split the same way: a palette entry is a token, a system-property
  // lookup is infrastructure that happens to be final.
  const theme = [...themeMethods];
  const declaredMethodNames = new Set(methods.map((m) => m.name));
  const nestedNames = new Set(nestedTypes.map((t) => t.name));
  for (const field of fields) {
    if (field.final && isThemeToken(field, declaredMethodNames, nestedNames)) theme.push(field);
    else support.push(field);
  }

  const collision = duplicateTypeName([...sections, ...composites]);
  if (collision) return refusal(`two members would produce class ${collision}`, className);

  return {
    feasible: true,
    reason: null,
    className,
    theme,
    support,
    sections,
    composites,
    template,
    nestedTypes,
  };
}

// ------------------------------------------------------------------ parsing ---

/**
 * The top-level type's members, at class level only.
 *
 * Not a Java parser — the same bargain `java-outline.mjs` strikes. It walks
 * braces from the type declaration and reads what sits at depth 1, which is
 * exactly as much as is needed for a file this harness generated. Anything it
 * cannot account for becomes a refusal upstream rather than a guess here.
 */
function parse(source) {
  const lines = source.split(/\r?\n/);

  let start = -1;
  let className = null;
  for (let i = 0; i < lines.length; i += 1) {
    const hit = CLASS_DECL.exec(lines[i]);
    if (hit && !/^\s/.test(lines[i])) {
      start = i;
      className = hit[2];
      break;
    }
  }
  if (start < 0) return { reason: "no top-level type declaration", className: null };

  const fields = [];
  const methods = [];
  const nestedTypes = [];

  let depth = 0;
  let i = start;

  for (; i < lines.length; i += 1) {
    const line = lines[i];

    if (depth === 0) {
      depth += netBraces(line);
      continue;
    }
    if (depth !== 1) {
      depth += netBraces(line);
      continue;
    }

    const nested = CLASS_DECL.exec(line);
    if (nested) {
      const end = closingBrace(lines, i);
      nestedTypes.push({
        kind: nested[1],
        name: nested[2],
        line: i + 1,
        endLine: end.line + 1,
        balanced: end.balanced,
        text: lines.slice(i, end.line + 1).join("\n"),
        javadocLine: javadocStart(lines, i),
        doc: docOf(lines, i, javadocStart(lines, i)),
      });
      i = end.line;
      continue;
    }

    // A signature may wrap. `private static DocumentTextStyle style(double size,`
    // continues on the next line, and a regex anchored to a single line does not
    // see it — the method was then in no bucket at all and vanished from the
    // bundle silently, which is the one outcome a splitter must never have.
    // Only from a line that actually starts something. Scanning forward from a
    // blank line found the *next* declaration and recorded it against the blank
    // one, so `public void compose(…)` was read as neither public nor starting
    // where it starts.
    const starts = line.trim() !== "" && !/^\s*(\/\/|\*|\/\*)/.test(line);
    const declaration = starts ? joinedDeclaration(lines, i) : null;
    const method = declaration ? METHOD_DECL.exec(declaration.text) : null;
    if (method && !STATEMENT_HEAD.test(line)) {
      const end = closingBrace(lines, declaration.headLine);
      methods.push({
        name: method[2],
        returnType: method[1].trim().split(/\s+/).pop(),
        params: parseParams(method[3]),
        static: /\bstatic\b/.test(line),
        public: /\bpublic\b/.test(line.split("(")[0]),
        line: i + 1,
        endLine: end.line + 1,
        balanced: end.balanced,
        signature: declaration.text.trim(),
        javadocLine: javadocStart(lines, i),
        doc: docOf(lines, i, javadocStart(lines, i)),
        text: lines.slice(i, end.line + 1).join("\n"),
        body: lines.slice(i + 1, end.line).join("\n"),
      });
      i = end.line;
      continue;
    }

    // A field declaration, including one whose initialiser opens a call on the
    // same line (`= readIconManifest();`, `= Path.of(`) or runs over several.
    const field = FIELD_DECL.exec(line);
    if (field && !STATEMENT_HEAD.test(line)) {
      const end = statementEnd(lines, i);
      fields.push(fieldFrom(field, lines, i, end));
      i = end;
      continue;
    }

    depth += netBraces(line);
    if (depth === 0) break;
  }

  const unclaimed = unaccountedLine(lines, start, [...methods, ...fields, ...nestedTypes]);
  if (unclaimed) {
    return {
      reason: `unparsed declaration at line ${unclaimed.line}: ${unclaimed.text.trim()}`,
      className,
    };
  }

  return { reason: null, className, fields, methods, nestedTypes };
}

function fieldFrom(match, lines, from, to) {
  const text = lines.slice(from, to + 1).join("\n");
  return {
    name: match[5],
    type: match[4],
    visibility: match[1] ?? "",
    static: Boolean(match[2]),
    final: Boolean(match[3]),
    line: from + 1,
    endLine: to + 1,
    text,
    initialiser: text.includes("=") ? text.slice(text.indexOf("=") + 1) : "",
    javadocLine: javadocStart(lines, from),
    doc: docOf(lines, from, javadocStart(lines, from)),
  };
}

/** Parameters as `{type, name}`, enough to ask what the first one is. */
function parseParams(raw) {
  const trimmed = raw.trim();
  if (trimmed === "") return [];
  const out = [];
  let depth = 0;
  let current = "";
  for (const ch of trimmed) {
    if (ch === "<" || ch === "(") depth += 1;
    if (ch === ">" || ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out
    .map((part) => part.trim().split(/\s+/).filter(Boolean))
    .filter((parts) => parts.length >= 2)
    .map((parts) => ({ type: baseType(parts[parts.length - 2]), name: parts[parts.length - 1] }));
}

/** `Map<String, IconAsset>` → `Map`; `final SectionBuilder` → `SectionBuilder`. */
function baseType(token) {
  return token.replace(/<.*$/, "").replace(/\[\]$/, "").split(".").pop();
}

// -------------------------------------------------------------- classifying ---

/** A helper draws when it appends to a builder or hands back a piece of page. */
function drawsInto(method) {
  const first = method.params[0];
  if (first && BUILDER_TYPES.has(first.type)) return true;
  return NODE_TYPES.has(baseType(method.returnType ?? ""));
}

/** A helper that returns a style is typography, and typography is theme. */
function makesToken(method) {
  const first = method.params[0];
  if (first && BUILDER_TYPES.has(first.type)) return false;
  return STYLE_TYPES.has(baseType(method.returnType ?? ""));
}

/**
 * A constant is a design token unless it is plainly infrastructure.
 *
 * Two disqualifiers, both mechanical: a type that is a handle rather than a
 * value (`Path`), and an initialiser that calls a method this class declares —
 * `ICONS = readIconManifest()` belongs with the method it calls, not with the
 * palette.
 */
function isThemeToken(field, declaredMethodNames) {
  if (NON_THEME_TYPES.has(baseType(field.type))) return false;
  for (const name of declaredMethodNames) {
    if (new RegExp(`\\b${name}\\s*\\(`).test(field.initialiser)) return false;
  }
  return true;
}

/** For each method, the set of methods whose bodies call it. */
function callGraph(source, methods) {
  const names = new Set(methods.map((m) => m.name));
  const callers = new Map();
  for (const name of names) callers.set(name, new Set());

  for (const method of methods) {
    // `\.name(` is a call on something else — `row.name("Body")` must not read
    // as a call to a template method that happens to share the name.
    for (const hit of method.body.matchAll(/(^|[^\w.])(\w+)\s*\(/g)) {
      const called = hit[2];
      if (called !== method.name && names.has(called)) callers.get(called).add(method.name);
    }
  }
  return callers;
}

function declaredSections(plan) {
  const mapping = plan && Array.isArray(plan.componentMapping) ? plan.componentMapping : [];
  return mapping
    .filter((entry) => entry && typeof entry.renderMethod === "string" && entry.renderMethod)
    .map((entry) => ({
      region: typeof entry.region === "string" ? entry.region : null,
      renderMethod: entry.renderMethod,
      notes: typeof entry.notes === "string" ? entry.notes : null,
    }));
}

function duplicateTypeName(members) {
  const seen = new Set();
  for (const member of members) {
    if (seen.has(member.typeName)) return member.typeName;
    seen.add(member.typeName);
  }
  return null;
}

// -------------------------------------------------------------------- names ---

/** `sidebar-contact` / `sidebar contact` / `sidebarContact` → `SidebarContact`. */
export function pascal(text) {
  return String(text)
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .flatMap((word) => word.split(/(?=[A-Z])/))
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("");
}

/** `renderSidebarContact` → `SidebarContact`. */
function renderStem(methodName) {
  return pascal(methodName.replace(/^render/, ""));
}

/** Never `SectionSection`, and never a bare `Section`. */
function sectionType(stem) {
  const base = stem || "Body";
  return base.endsWith("Section") ? base : `${base}Section`;
}

// -------------------------------------------------------------------- braces ---

function netBraces(line) {
  const stripped = stripLiterals(line);
  let net = 0;
  for (const ch of stripped) {
    if (ch === "{") net += 1;
    if (ch === "}") net -= 1;
  }
  return net;
}

/**
 * Braces inside a string or a character literal are not structure.
 *
 * Line comments go too: `// }` is the same trap. Block comments are left alone —
 * a generated template puts them above declarations, not around braces.
 */
function stripLiterals(line) {
  return line
    .replace(/\\["'\\]/g, "")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/\/\/.*$/, "");
}

function closingBrace(lines, from) {
  let depth = 0;
  let seen = false;
  for (let i = from; i < lines.length; i += 1) {
    const net = netBraces(lines[i]);
    if (net !== 0 || /[{}]/.test(stripLiterals(lines[i]))) seen = seen || /\{/.test(stripLiterals(lines[i]));
    depth += net;
    if (seen && depth <= 0) return { line: i, balanced: true };
  }
  return { line: lines.length - 1, balanced: false };
}

/**
 * The first line of the class body that no member claims.
 *
 * This is the guard that matters. A regex anchored to one line did not see
 * `private static DocumentTextStyle style(double size,` — the signature wraps —
 * so the method belonged to no bucket, was written into no file, and the split
 * lost it without a word. Everything else here can fail loudly; only a silent
 * drop produces a bundle that looks complete and is not. So every line inside
 * the type is accounted for, and one that is not is a refusal.
 */
function unaccountedLine(lines, start, members) {
  const covered = new Set();
  for (const member of members) {
    const from = member.javadocLine ?? member.line;
    for (let n = from; n <= member.endLine; n += 1) covered.add(n);
  }

  let depth = 0;
  let inBlockComment = false;
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    const before = depth;
    depth += netBraces(line);
    if (before === 0) continue;          // the type declaration line itself
    if (before === 1 && depth === 0) break; // the closing brace of the type
    if (before !== 1) continue;          // inside a member, which owns its lines

    const text = line.trim();
    if (inBlockComment) {
      if (text.includes("*/")) inBlockComment = false;
      continue;
    }
    if (text === "" || text.startsWith("//")) continue;
    if (text.startsWith("/*")) {
      if (!text.includes("*/")) inBlockComment = true;
      continue;
    }
    if (text.startsWith("@")) continue;  // an annotation belongs to what follows
    if (covered.has(i + 1)) continue;

    return { line: i + 1, text: line };
  }
  return null;
}

/**
 * A declaration as one logical line, however many physical ones it spans.
 *
 * Returns null when the text starting at `from` is not a declaration head —
 * parentheses that never balance, or no `{` / `;` to end on within a sane
 * distance.
 */
function joinedDeclaration(lines, from) {
  let parens = 0;
  let text = "";
  for (let i = from; i < lines.length && i - from < 24; i += 1) {
    const stripped = stripLiterals(lines[i]);
    for (const ch of stripped) {
      if (ch === "(") parens += 1;
      if (ch === ")") parens -= 1;
    }
    text = text === "" ? lines[i] : `${text.replace(/\s+$/, "")} ${lines[i].trim()}`;
    if (parens > 0) continue;
    if (/\{\s*$/.test(stripped.trimEnd())) return { text, headLine: i };
    if (/;\s*$/.test(stripped.trimEnd())) return null;
  }
  return null;
}

/** The line that ends the statement starting at `from`, by its semicolon. */
function statementEnd(lines, from) {
  for (let i = from; i < lines.length; i += 1) {
    if (stripLiterals(lines[i]).includes(";")) return i;
  }
  return from;
}

/**
 * The Javadoc above a declaration, as text.
 *
 * A moved member keeps its reasoning. This harness records *why* a constant has
 * the value it has in the comment above it, and a member relocated without it
 * invites the next edit to undo the reason.
 */
function docOf(lines, at, javadocLine) {
  if (javadocLine === null || javadocLine === undefined) return "";
  return lines.slice(javadocLine - 1, at).join("\n");
}

function javadocStart(lines, at) {
  let i = at - 1;
  while (i >= 0 && /^\s*(@\w+.*)?$/.test(lines[i]) && lines[i].trim() !== "") i -= 1;
  if (i < 0 || !/\*\/\s*$/.test(lines[i])) return null;
  while (i >= 0 && !/^\s*\/\*\*/.test(lines[i])) i -= 1;
  return i < 0 ? null : i + 1;
}

function refusal(reason, className) {
  return {
    feasible: false,
    reason,
    className,
    theme: [],
    support: [],
    sections: [],
    composites: [],
    template: [],
    nestedTypes: [],
  };
}

// ------------------------------------------------------------------ emitting ---

/**
 * Turn a classification into the files a published bundle carries.
 *
 * ## The two things that keep this honest
 *
 * **Static imports, not rewritten references.** charcoal-gold has 71 constants.
 * Qualifying every use of them — `Theme.ACCENT` — is 71 chances to corrupt a
 * string literal for no gain, so the theme and the support class are imported
 * on demand and every reference to them is left exactly as the loop wrote it.
 * The only names this rewrites are the ones that genuinely moved to a class of
 * their own: sections and composites.
 *
 * **The whole import block, copied.** Computing the minimal import set per file
 * is a type-resolution problem, and there is no parser here to do it with.
 * `javac` does not error on an unused import, so every emitted file gets the
 * original block and the compile gate proves the result.
 *
 * @param {object} classification from {@link classify}
 * @param {{source: string, basePackage: string, className: string}} options
 * @returns {{files: Map<string, string>, layout: object}} paths relative to `src/`
 */
export function emit(classification, options) {
  const { source, basePackage, className } = options;
  if (!classification.feasible) {
    throw new Error(`cannot emit an infeasible split: ${classification.reason}`);
  }

  const stem = className.replace(/Template$/, "") || className;
  const themeName = `${stem}Theme`;
  const supportName = `${stem}Support`;

  const imports = importLines(source);
  const renames = renameMap(classification);

  const themeMembers = classification.theme;
  const supportMembers = [...classification.nestedTypes, ...classification.support];

  const themePackage = `${basePackage}.theme`;
  const supportPackage = `${basePackage}.support`;
  const sectionsPackage = `${basePackage}.sections`;
  const compositesPackage = `${basePackage}.composites`;

  // What every emitted file needs to see: the tokens, the infrastructure and its
  // nested types, the base package's spec, the composites — and the sections.
  //
  // Sections were once given only to the template class, on the reasoning that
  // nothing else calls a region. Nothing else *usually* calls a region, and
  // `rewriteCalls` runs over every moved member: a composite shared by two
  // sections that itself calls a third emits `ThirdSection.render(…)` into
  // `composites/`, where the name did not resolve. The failure surfaced at the
  // compile gate, after the bundle was already on disk. An unused import costs
  // nothing and javac does not complain about one; an absent import costs a
  // published bundle that does not build.
  const shared = [
    ...imports,
    `import ${basePackage}.*;`,
    themeMembers.length > 0 ? `import static ${themePackage}.${themeName}.*;` : null,
    supportMembers.length > 0 ? `import ${supportPackage}.${supportName}.*;` : null,
    supportMembers.length > 0 ? `import static ${supportPackage}.${supportName}.*;` : null,
    classification.composites.length > 0 ? `import ${compositesPackage}.*;` : null,
    classification.sections.length > 0 ? `import ${sectionsPackage}.*;` : null,
  ].filter(Boolean);

  /** The same set, minus the file's own package, which needs no import. */
  const importsFor = (ownPackage) => shared.filter((line) => line !== `import ${ownPackage}.*;`);

  const files = new Map();

  if (themeMembers.length > 0) {
    files.set(
      `theme/${themeName}.java`,
      javaFile({
        packageName: themePackage,
        imports: importsFor(themePackage).filter(
          // A class cannot static-import its own members.
          (line) => line !== `import static ${themePackage}.${themeName}.*;`,
        ),
        doc: themeDoc(className),
        name: themeName,
        members: themeMembers.map((m) => moveMember(m, { renames })),
      }),
    );
  }

  if (supportMembers.length > 0) {
    files.set(
      `support/${supportName}.java`,
      javaFile({
        packageName: supportPackage,
        imports: importsFor(supportPackage).filter(
          (line) =>
            line !== `import ${supportPackage}.${supportName}.*;`
            && line !== `import static ${supportPackage}.${supportName}.*;`,
        ),
        doc: supportDoc(className),
        name: supportName,
        members: supportMembers.map((m) => moveMember(m, { renames })),
      }),
    );
  }

  for (const section of classification.sections) {
    const locals = (section.local ?? []).map((m) =>
      moveMember(m, { renames, visibility: "private" }),
    );
    files.set(
      `sections/${section.typeName}.java`,
      javaFile({
        packageName: sectionsPackage,
        imports: importsFor(sectionsPackage),
        doc: sectionDoc(section),
        name: section.typeName,
        members: [moveMember(section, { renames, name: "render" }), ...locals],
      }),
    );
  }

  for (const composite of classification.composites) {
    files.set(
      `composites/${composite.typeName}.java`,
      javaFile({
        packageName: compositesPackage,
        imports: importsFor(compositesPackage),
        doc: compositeDoc(composite),
        name: composite.typeName,
        members: [moveMember(composite, { renames, name: renames.get(composite.name).name })],
      }),
    );
  }

  files.set(
    `${className}.java`,
    javaFile({
      packageName: basePackage,
      imports: importsFor(basePackage),
      doc: rewriteDoc(fileDoc(source), renames) || templateDoc(className),
      name: className,
      // The entry points keep their signatures exactly: they are the contract a
      // consumer calls, and the split is not allowed to change it.
      members: classification.template.map((m) => moveMember(m, { renames, keepModifiers: true })),
      instantiable: true,
    }),
  );

  return {
    files,
    layout: {
      className,
      themeClass: themeMembers.length > 0 ? `${themePackage}.${themeName}` : null,
      supportClass: supportMembers.length > 0 ? `${supportPackage}.${supportName}` : null,
      sections: classification.sections.map((s) => ({
        type: `${sectionsPackage}.${s.typeName}`,
        method: s.name,
        region: s.region,
      })),
      composites: classification.composites.map((c) => `${compositesPackage}.${c.typeName}`),
    },
  };
}

/** Old method name → where it moved and what it is called there. */
function renameMap(classification) {
  const renames = new Map();
  for (const section of classification.sections) {
    renames.set(section.name, { qualifier: section.typeName, name: "render" });
  }
  for (const composite of classification.composites) {
    renames.set(composite.name, {
      qualifier: composite.typeName,
      // A helper that appends to a builder renders; one that hands back a node
      // creates. `AddressBlock.create(...)` and `SectionHeading.render(...)`
      // read as what they do, which a kept `sidebarHeading` would not.
      name: baseType(composite.returnType ?? "void") === "void" ? "render" : "create",
    });
  }
  return renames;
}

/**
 * A member, moved: re-declared at its new visibility and with its calls
 * repointed at wherever the things it calls have gone.
 *
 * The Javadoc travels with it. This harness records why a value is what it is
 * in the comment above it, and a constant relocated without its reason is an
 * invitation to undo the reason.
 */
function moveMember(member, { renames, name = null, visibility = "public", keepModifiers = false }) {
  const isType = member.kind !== undefined;
  const isField = !isType && member.params === undefined;

  let text;
  if (isField || isType) {
    text = member.text.replace(/^(\s*)(?:public|private|protected)\s+/, `$1${visibility} `);
    text = rewriteCalls(text, renames);
  } else {
    const lines = member.text.split("\n");
    const head = keepModifiers ? lines[0] : reshapeSignature(lines[0], name ?? member.name, visibility);
    const body = rewriteCalls(lines.slice(1).join("\n"), renames);
    text = [head, body].join("\n");
  }

  return member.doc ? `${member.doc}\n${text}` : text;
}

/** `private void renderContact(SectionBuilder …) {` → `public static void render(SectionBuilder …) {`. */
function reshapeSignature(line, name, visibility) {
  const hit = /^(\s*)((?:(?:public|private|protected|static|final|abstract|synchronized|native)\s+)*)([\w.<>,?\[\]\s]+?)\s+(\w+)\s*\(/.exec(line);
  if (!hit) return line;
  const rest = line.slice(hit[0].length);
  return `${hit[1]}${visibility} static ${hit[3].trim()} ${name}(${rest}`;
}

/**
 * Repoint calls at the classes their targets moved to.
 *
 * Only the names that moved to a class of their own are touched — the theme and
 * the support class arrive by static import, so their references stay as
 * written. `this::renderCompanyLogo` is a call too: the invoice lane has one,
 * and a rewriter that only knew about `name(` would have left it dangling.
 */
function rewriteCalls(text, renames) {
  let out = text;
  for (const [from, to] of renames) {
    out = out.replace(new RegExp(`this::${from}\\b`, "g"), `${to.qualifier}::${to.name}`);
    out = out.replace(
      new RegExp(`(^|[^\\w.$])${from}\\s*\\(`, "gm"),
      `$1${to.qualifier}.${to.name}(`,
    );
  }
  return out;
}

/**
 * The same repointing, for prose.
 *
 * A template's own Javadoc names its methods — `{@link #heading}`,
 * `{@code body(...)}` — and those names are gone once the members are in
 * classes of their own. `javac` does not care; `javadoc` fails on a `@link` to a
 * member that no longer exists, and a reader following one is sent nowhere.
 */
function rewriteDoc(doc, renames) {
  if (!doc) return doc;
  let out = doc;
  for (const [from, to] of renames) {
    out = out.replace(
      new RegExp(`\{@link\s+#${from}(\([^)]*\))?\s*\}`, "g"),
      `{@link ${to.qualifier}#${to.name}}`,
    );
  }
  return rewriteCalls(out, renames);
}

/** The file's own import block, in the order it was written. */
function importLines(source) {
  return source.split(/\r?\n/).filter((line) => /^import\s/.test(line));
}

/** The Javadoc immediately above the top-level type, if the file has one. */
function fileDoc(source) {
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const hit = CLASS_DECL.exec(lines[i]);
    if (hit && !/^\s/.test(lines[i])) {
      const start = javadocStart(lines, i);
      return start === null ? "" : lines.slice(start - 1, i).join("\n");
    }
  }
  return "";
}

function javaFile({ packageName, imports, doc, name, members, instantiable = false }) {
  const seen = new Set();
  const importBlock = imports.filter((line) => {
    if (seen.has(line)) return false;
    seen.add(line);
    return true;
  });

  // A holder of static members is not a thing anyone should instantiate. The
  // template class is the exception: `new MintEditorialCvTemplate()` is how a
  // consumer uses the bundle.
  const guard = instantiable ? [] : [`    private ${name}() {`, "    }", ""];

  return [
    `package ${packageName};`,
    "",
    ...importBlock,
    importBlock.length > 0 ? "" : null,
    doc,
    `public final class ${name} {`,
    "",
    ...guard,
    members.join("\n\n"),
    "}",
    "",
  ]
    .filter((part) => part !== null)
    .join("\n");
}

function themeDoc(className) {
  return `/**
 * Design tokens for {@link ${className}} — colours, type scale, spacing and the
 * derived geometry every section measures against.
 *
 * <p>Sections read these through a static import, so a change here reaches the
 * whole document without touching a single section file. That is the point of
 * the split: global typography is one edit, not a walk through every region.</p>
 */`;
}

function supportDoc(className) {
  return `/**
 * Infrastructure {@link ${className}} leans on: asset resolution, the data
 * directory, and the small text utilities the sections share.
 *
 * <p>Deliberately not in {@code composites} — nothing here draws. A reader who
 * opens {@code composites/} is looking for visual building blocks, and finding
 * a manifest reader among them would be the same mis-filing as putting the icon
 * lookup beside the palette.</p>
 */`;
}

function sectionDoc(section) {
  const region = section.region
    ? `the <em>${section.region}</em> region`
    : "one region of the document";
  const notes = section.notes ? `\n *\n * <p>${escapeDoc(section.notes)}</p>` : "";
  return `/**
 * Renders ${region}.
 *
 * <p>One file, one semantic part of the document: a change to this region is a
 * change to this file, and to nothing else.</p>${notes}
 */`;
}

function compositeDoc() {
  return `/**
 * A reusable visual block, shared by more than one section.
 *
 * <p>It knows nothing about which document it is used in — that is what makes
 * it reusable, and what keeps the same construction from being written out
 * twice and drifting apart.</p>
 */`;
}

function templateDoc(className) {
  return `/**
 * ${className} — the document, assembled from its sections.
 *
 * <p>This class is the table of contents. Every region lives in its own file
 * under {@code sections/}, the shared blocks under {@code composites/}, and the
 * design tokens in {@code theme/}.</p>
 */`;
}

/** Javadoc cannot carry a raw tag marker or a closing comment marker. */
function escapeDoc(text) {
  return String(text)
    .replace(/\*\//g, "*&#47;")
    .replace(/@/g, "&#64;")
    .replace(/\r?\n/g, "\n * ");
}
