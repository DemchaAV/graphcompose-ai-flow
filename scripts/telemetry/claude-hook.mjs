#!/usr/bin/env node
/**
 * scripts/telemetry/claude-hook.mjs — the checkpoint writer, for Claude Code.
 *
 * Registered in `hooks/hooks.json` for SessionStart, UserPromptSubmit,
 * SubagentStop, Stop and SessionEnd. Claude's event names are the vocabulary
 * the state file is written in, so there is nothing to translate: what a
 * checkpoint records, and why it must be fast and must always exit 0, is in
 * `checkpoint.mjs`.
 */

import { main } from "./checkpoint.mjs";

await main({ host: "claude-code" });
