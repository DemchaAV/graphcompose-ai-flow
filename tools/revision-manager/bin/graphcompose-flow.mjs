#!/usr/bin/env node
/**
 * The CLI is TypeScript compiled into dist/, which is gitignored — so on a
 * fresh clone or a fresh plugin install this file has nothing to import. Say
 * that in one line instead of letting Node print a module-resolution stack
 * trace, because this is the most likely first failure a new user ever sees.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(here, "..", "dist", "cli.js");

if (!fs.existsSync(entry)) {
  process.stderr.write(
    "graphcompose-flow is not built yet (tools/revision-manager/dist is missing).\n" +
      "Run the one-time setup from the repository root:\n\n" +
      "    npm run setup\n\n" +
      "It installs and builds the Node tools; see docs/plugin-installation.md.\n",
  );
  process.exit(69); // EX_UNAVAILABLE — a missing service, not a usage error
}

await import("../dist/cli.js");
