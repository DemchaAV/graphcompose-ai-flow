# Test Result — revision-001

## Build

| Step                                                 | Result | Notes |
|------------------------------------------------------|--------|-------|
| `mvn package` of `tools/preview-renderer`            | PASS   | preview-renderer.jar built. |
| `mvn package` of `examples/noir-corporate-cv/render-runner` | PASS | revision-001 template compiled cleanly against GraphCompose 1.6.0 (jitpack `v1.6.0`). |
| `mvn dependency:build-classpath`                     | PASS   | classpath written to `target/runtime-classpath.txt`. |

## Render passes

| Pass                                  | PDF | PNG | Notes |
|---------------------------------------|-----|-----|-------|
| Clean (`output.pdf`)                  | OK  | OK  | Single-page A4 portrait. |
| Debug with `--guide-lines true` (`output-debug.pdf`) | OK  | OK  | GraphCompose layout guide-lines overlay. |

## Smoke test

`generated-test.java` is shipped next to the template but the
flow's render path is the canonical compile check — `mvn package`
above doubles as the smoke test, and the rendered PDF is the
ground truth. Future revisions may add a dedicated test execution
phase if the GraphCompose 1.6 API grows surface that benefits from
unit-level coverage.

## Known render-time substitutions

1. **`●` / `○` glyphs missing in Poppins.** First render attempt
   failed with
   `preview-renderer failed: could not find the glyphId for the character: ?, codePoint: 9679 (0x25CF)`.
   Fixed by switching the meter to `•` (U+2022 BULLET) + lowercase
   `o`, both font-safe across Poppins / Helvetica. Tracked as the
   first follow-up in `visual-review.md`.

## Exit

`render.log` captures every command and every line of stdout / stderr
from the asset-resolver, the two `mvn package` invocations, the
classpath build, and the two `java -jar preview-renderer` runs.
