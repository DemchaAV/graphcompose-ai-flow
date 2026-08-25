/**
 * scripts/lib/pagination-plan.mjs — was the page model decided, or did it happen?
 *
 * A one-page reference hides every pagination question. A proposal, a report or
 * a book asks all of them at once, and each has to be answered before the layout
 * is built around an answer nobody chose:
 *
 *   Does page one differ?  A cover or a title page usually has its own margins,
 *   no running header and no page number. `DocumentSession.pageMargins` takes
 *   per-page rules — `PageMarginRule.page(1, DocumentInsets.zero())` — precisely
 *   so that can be stated instead of worked around.
 *
 *   Where does it break?  `AbstractFlowBuilder.addPageBreak` puts a break where
 *   the document means one. A break the layout needs and nobody declared is a
 *   break that moves whenever the content does.
 *
 *   What must not split?  `keepTogether` keeps a block whole; `keepWithNext`
 *   stops a heading being orphaned above its content, or a table header sitting
 *   alone at the foot of a page. Both exist on SectionBuilder and ModuleBuilder.
 *
 * None of these is discoverable from the render. A template that only ever
 * renders its one-page sample never exercises a break at all, so the pixel diff
 * is silent and stays silent until real content arrives.
 *
 * Every signature named here was verified against the 2.2 allow-list.
 */

/** Rules a keepRule may ask for, and the call that satisfies each. */
export const KEEP_CALLS = Object.freeze({
  keepTogether: "keepTogether",
  keepWithNext: "keepWithNext",
});

/**
 * Check a plan's pagination block against the document it is planning.
 *
 * @param {{plan: object, referencePages: number, source: string,
 *          componentMapping?: Array<object>}} input
 * @returns {Array<{kind: string, detail: string, region?: string}>}
 */
export function checkPaginationPlan({ plan = {}, referencePages = 1, source = "", componentMapping = [] }) {
  const findings = [];
  const pagination = plan.pagination ?? null;

  // A single-page document has no page model to decide. Saying nothing is the
  // right answer there, and demanding a block would be noise.
  if (referencePages <= 1) return findings;

  if (!pagination) {
    findings.push({
      kind: "pagination-undecided",
      detail:
        `the reference has ${referencePages} pages and the plan states no pagination block. ` +
        "Decide the page model before building the layout: uniform, first-page-different " +
        "(a cover or title page with its own margins and no running chrome — " +
        "DocumentSession.pageMargins takes PageMarginRule.page(1, ...)), or sectioned",
    });
    return findings;
  }

  if (pagination.pageModel === "first-page-different" && !(pagination.firstPageDiffers ?? []).length) {
    findings.push({
      kind: "first-page-difference-unstated",
      detail:
        "the page model is first-page-different and nothing says what differs. " +
        "Margins, running header, page number — name them, or the difference is " +
        "whatever the layout happens to produce",
    });
  }

  const keepRules = pagination.keepRules ?? [];
  if (!keepRules.length) {
    findings.push({
      kind: "keep-rules-unstated",
      detail:
        "a document that flows across pages states no keepTogether or keepWithNext rule. " +
        "A heading can be orphaned above its content and a table header left alone at the " +
        "foot of a page, and neither shows up in a render of the one-page sample",
    });
  }

  // A rule that was decided and not built is worse than one nobody wrote: the
  // plan says the break is handled and the template does not handle it.
  const methodFor = new Map(componentMapping.map((entry) => [entry.region, entry.renderMethod]));
  for (const rule of keepRules) {
    const call = KEEP_CALLS[rule.rule];
    if (!call) continue;
    if (!source.includes(call)) {
      findings.push({
        kind: "keep-rule-not-built",
        region: rule.region,
        detail:
          `the plan says ${rule.region} needs ${rule.rule} (${rule.why}), and the template ` +
          `calls ${call} nowhere` +
          (methodFor.has(rule.region) ? ` — ${methodFor.get(rule.region)}() owns that region` : ""),
      });
    }
  }

  // Declared breaks are checked the same way, and for the same reason.
  const breaks = pagination.breaks ?? [];
  if (breaks.length && !source.includes("addPageBreak")) {
    findings.push({
      kind: "page-break-not-built",
      detail:
        `the plan declares ${breaks.length} explicit page break(s) — ` +
        `after ${breaks.map((b) => b.after).join(", ")} — and the template calls addPageBreak nowhere`,
    });
  }

  return findings;
}
