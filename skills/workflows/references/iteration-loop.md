# The iteration loop

A successful render is not the stopping point. Keep going until the
review says `READY_FOR_APPROVAL` or `BLOCKED` — those two are the only
places the loop ends on its own.

```text
        fix one thing
              ↓
            build
              ↓
           render
              ↓
            diff
              ↓
         evaluate  →  write visual-review.json
              ↓
     ┌────────┴────────┐
   REVISE          READY_FOR_APPROVAL / BLOCKED
     │                  │
     └──── loop         └── stop, report, wait for the user
```

## One mismatch per pass

Each iteration fixes the **single** largest actionable mismatch — the
one named in `largestMismatch` — and nothing else. Rewriting the
template wholesale on every pass destroys the evidence about what
actually helped, and makes a regression impossible to attribute.

The order to work in, when several mismatches are equally loud:

1. structural geometry, page and crop proportions
2. large surfaces and panels
3. anchors, alignment, spacing
4. typography hierarchy
5. icons, badges, dots, small marks
6. final colour and anti-aliasing differences

Fixing colour before geometry wastes a pass: the geometry fix moves the
thing you just recoloured.

## Bounds

From `limits` in [`config/pipeline.json`](../../../config/pipeline.json):

| Limit | Default | Meaning |
|---|---|---|
| `maxIterations` | 8 | total passes in one loop |
| `maxConsecutiveBuildFailures` | 3 | compile/render failures in a row |
| `maxSameMismatchAttempts` | 3 | attempts at the *same* mismatch id |

When a bound is hit, stop and report `BLOCKED` with a
`failureCategory`. Do not raise the limit to keep going — the limit
existing at all is the admission that a loop which is not converging
will not converge with more turns.

**Mismatch ids must be stable.** If the same problem survives a fix,
reuse its id verbatim; that repetition is exactly what
`maxSameMismatchAttempts` counts. Renaming a surviving mismatch defeats
the safeguard and hides the fact that three passes achieved nothing.

## Failure categories

Every stop that is not `READY_FOR_APPROVAL` carries one of these
(`failureCategories` in the config, `$defs/failureCategory` in the
schemas):

| Category | Use when |
|---|---|
| `BUILD_FAILED` | the template does not compile |
| `RENDER_FAILED` | it compiles but the render step fails |
| `ASSET_FAILED` | an icon or font could not be resolved |
| `VISUAL_MISMATCH` | it renders, but parity is not reachable by the next obvious edit |
| `GRAPHCOMPOSE_API_LIMITATION` | verified library behaviour blocks the fix — name the API and what was tried |
| `MISSING_REFERENCE_INFORMATION` | the reference does not show what is needed — say which region |
| `ITERATION_LIMIT` | a bound above was reached |

A category without specifics is not a report. `GRAPHCOMPOSE_API_LIMITATION`
means naming the method, the version it was verified against, and the
alternative that was tried.

## Recording each pass

- `visual-review.json` per pass, against
  [`schemas/visual-review.schema.json`](../../../schemas/visual-review.schema.json).
- `iteration` on the revision, 1-based, when the pass belongs to an
  autonomous loop rather than a human-opened revision.
- `changedComponents` listing the render methods actually touched —
  this is what makes selective rollback possible later.

## Stopping early on purpose

Stop and hand back to the user, without exhausting the bounds, when:

- the review recommends `APPROVE` (or `AE == 0` under a diff gate)
- the remaining differences were explicitly accepted by the user
- the next fix needs information only the user has
- the next fix is blocked by verified GraphCompose behaviour

Silence is not one of the stopping conditions. If the loop stops, say
which of these it was.
