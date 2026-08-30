#!/usr/bin/env node
/**
 * This bin goes through the package's guard before it touches dist/: it is
 * gitignored, so a fresh clone has nothing to import, and a dist/ left behind
 * src/ is worse than a missing one because it loads and runs — rejecting flags
 * it predates and silently doing less than it was asked. The rationale in full
 * is in ./require-build.mjs.
 *
 * The dist import must stay dynamic and stay below the guard call: a static
 * `import '../dist/…'` is hoisted and would run before the check.
 */
import { requireBuild } from "./require-build.mjs";

requireBuild("graphcompose-flow", "cli.js");

await import("../dist/cli.js");
