#!/usr/bin/env node
/**
 * Same as the revision-manager shim: dist/ is gitignored, so a fresh clone or
 * plugin install has nothing to import here. Fail with an instruction rather
 * than a module-resolution stack trace.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(here, "..", "dist", "crop-region-cli.js");

if (!fs.existsSync(entry)) {
  process.stderr.write(
    "crop-region is not built yet (tools/visual-diff/dist is missing).\n" +
      "Run the one-time setup from the repository root:\n\n" +
      "    npm run setup\n\n" +
      "It installs and builds the Node tools; see docs/plugin-installation.md.\n",
  );
  process.exit(69); // EX_UNAVAILABLE
}

await import("../dist/crop-region-cli.js");
