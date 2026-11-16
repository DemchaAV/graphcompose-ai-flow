---
skillId: graphcompose-typography-2-4
targetLibrary: GraphCompose
targetVersion: 2.4.x
status: active
verifiedAgainst: 2.4.0
lastValidated: 2026-09-21
---

# Typography on 2.4 — what this line added

Read [`../graphcompose-2.2/typography.md`](../graphcompose-2.2/typography.md)
for the type scale, families, weights and the rules for matching a
reference's hierarchy. All of it still holds. This page is the part that
page predates.

```bash
node scripts/api-query.mjs --version 2.4 --task typography.letter-spacing
```

## Letter spacing is a property of the style

A reference with a spaced wordmark, letter-spaced small caps, or a
deliberately tight display heading needs tracking. On 2.4 it lives in
`DocumentTextStyle`:

```java
DocumentTextStyle eyebrow = theme.label().withLetterSpacing(DocumentLetterSpacing.ofFontSize(0.12));
```

| Call | What it does |
|---|---|
| `DocumentTextStyle.withLetterSpacing(DocumentLetterSpacing)` | a copy of the style with tracking |
| `DocumentTextStyle.letterSpacing()` | reads it back |
| `DocumentTextStyle.Builder.letterSpacing(DocumentLetterSpacing)` | sets it while building a style |
| `DocumentLetterSpacing.points(double)` | absolute tracking |
| `DocumentLetterSpacing.ofFontSize(double fraction)` | tracking as a fraction of the type size |
| `DocumentLetterSpacing.resolve(double fontSize)` | the points it works out to |
| `DocumentLetterSpacing.NONE`, `isNone()` | the unset value, and the test for it |

## Which of the two forms

`ofFontSize(...)` is the default choice. Tracking is an optical property
of the type size, so a fraction keeps a label correct when the scale
moves — and the scale moves often, because matching a reference means
adjusting sizes until the measured type matches.

`points(...)` is for when the value must not move: a wordmark measured
off the reference at one size, a rail of labels that has to align to a
grid whatever the size does.

Because tracking is on the style, set it once where the style is
defined. A `withLetterSpacing(...)` at the call site means two places
now decide how that text is spaced.

## What this replaces

Typing spaces between letters — `"C U R R I C U L U M"` — is the
construction this replaces. It changes the text: the PDF no longer
contains the word, copy-paste and search break, and the spacing is a
sequence of word gaps that can wrap mid-word. If a reference shows
spaced capitals, the answer is a tracked style, not a spaced string.

A row of per-letter nodes is the other fake. It is legitimate only when
the letters really are separate design elements — individually placed or
individually coloured — and it costs the text being text.

## Measuring, when it matters

The engine's measurement surface carries `TextMeasurementSystem` with
`textWidth(TextStyle, String)`, `lineHeight(TextStyle)` and
`lineMetrics(TextStyle)`. It is engine-side, not the authoring surface:
reach for it in a probe or a diagnostic, not in a template. A template
that measures its own text is usually a template working around a layout
primitive it should have used.

`FontShowcase` renders a preview of the available fonts —
`renderAvailableFontsPreview(Path)` writes one to disk. Use it when
choosing a family against a reference instead of guessing from a name.

## What to check in the render

- Tracked text measures the same total width as the reference's, not
  just "looks spaced". A fraction that is close but wrong shows up as a
  drift that grows along the line.
- The style carries the tracking, so every use of it is tracked. One
  tracked heading and one untracked heading in the same role means the
  tracking went on at the call site.
- No string in `<doc-kind>-data.json` contains spaced-out capitals. That
  is content carrying presentation, and it will survive every later
  theme change.
