#!/usr/bin/env node
// Launcher: runs the TypeScript CLI through tsx so no build step is needed.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tsx = join(root, "node_modules", "tsx", "dist", "cli.mjs");
const r = spawnSync(process.execPath, [tsx, join(root, "src", "cli", "main.ts"), ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
