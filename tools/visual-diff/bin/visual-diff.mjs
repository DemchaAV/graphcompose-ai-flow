#!/usr/bin/env node
/**
 * Every bin in this package goes through the same guard before it touches
 * dist/: it is gitignored, so a fresh clone has nothing to import, and a dist/
 * left behind src/ is worse than a missing one because it loads and quietly
 * answers with an older release's arithmetic. The rationale in full — including
 * why an absent src/ means "current" — is in ./require-build.mjs.
 *
 * The dist import must stay dynamic and stay below the guard call: a static
 * `import '../dist/…'` is hoisted and would run before the check.
 */
import { requireBuild } from "./require-build.mjs";

requireBuild("visual-diff", "cli.js");

await import("../dist/cli.js");
