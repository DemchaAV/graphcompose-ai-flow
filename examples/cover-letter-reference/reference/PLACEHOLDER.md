# Cover Letter Reference — Placeholder

This folder is **awaiting a reference image**. The orchestrator must
NOT open `revision-001` until a screenshot lands here.

## How to kick off `revision-001`

1. Drop the cover-letter screenshot into this folder as
   `reference.png` (PNG, ≥ 1200 px wide, no DPI requirement — the
   visual analyzer downsamples as needed).
2. Optionally write a `reference.md` next to it describing what the
   reference depicts (one-line summary of layout, brand cues, the
   paired CV preset if any).
3. Hand the user gesture:

   > "Create a cover letter from this screenshot. Pair it with the
   > `mint-editorial-cv` CV preset."

   …or whichever CV preset the letter should pair against.

The orchestrator routes that gesture through the standard 11-agent
chain. On the V2 layered surface (`coverletter.v2.*`) the resulting
preset will:

- Reuse `CvIdentity` from the paired CV (masthead = name, contact,
  links) — the spec provider hands the same `CvIdentity` instance to
  both presets.
- Reuse `CvTheme` from the paired CV (colours, fonts, spacing,
  decoration) — the letter renders through the identical widget path.
- Use `coverletter.v2.components.LetterBody` as the only
  letter-specific renderer (greeting + body paragraphs + closing).
- Be a thin orchestrator: ~30-80 lines, no open-coded paragraph
  loops, no inline theme tokens.

See [`prompts/template-coder-agent.md`](../../../prompts/template-coder-agent.md)
§ "CV ↔ cover-letter pairing (V2 layered only)" for the full
contract the Template Coder will follow.

## Why a scaffold (not a stub revision)

A pre-populated `revision-001/` would either be a fabricated visual
(which violates the strict visual-parity contract — there's nothing
to match against) or a duplicate of an existing CV revision (which
violates the "every revision creates a new revision" rule). The
scaffold instead **declares the project's existence and intent**,
records the awaiting-reference state in
`template-project.json.notes`, and stays out of the orchestrator's
way until a real reference arrives.

## When this file is no longer needed

Once `reference.png` is committed and `revision-001/` exists with
real artifacts, this placeholder should be deleted — the
`revision-001` audit log carries the historical record from that
point on.
