// Desktop-shell end-to-end test: launches the real Electron app against dist/ (run `npm run build` first).
//   Linux CI:  xvfb-run -a node tests/e2e/desktop.mjs      Windows/macOS: node tests/e2e/desktop.mjs
import { _electron as electron } from "playwright";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
// VH_PACKAGED=/path/to/packaged/executable tests the packaged build instead of running from source.
const PACKAGED = process.env.VH_PACKAGED || null;
const launchOpts = () => ({
  executablePath: PACKAGED ?? require("electron"),
  args: [...(PACKAGED ? [] : ["."]), ...(process.platform === "linux" ? ["--no-sandbox", "--disable-gpu"] : []), `--user-data-dir=${userData}`],
  env: { ...process.env, VH_TEST_EXPORT_DIR: exportDir },
});
const exportDir = mkdtempSync(join(tmpdir(), "vhsfx-export-"));
const userData = mkdtempSync(join(tmpdir(), "vhsfx-userdata-"));
const shots = process.argv[2] ?? "workspace/e2e";
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`); };

const app = await electron.launch(launchOpts());
const page = await app.firstWindow();
const errors = [];
const outside = [];
page.on("request", (r) => { const u = r.url(); if (!/^(vhsfx:|blob:|data:|devtools:)/.test(u)) outside.push(u); });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await page.waitForLoadState("domcontentloaded");

check("loads from the app origin, not file:// or http", page.url().startsWith("vhsfx://app/"), page.url());
check("renderer has no Node access", await page.evaluate(() => typeof require === "undefined" && typeof process === "undefined"));
check("preload bridge exposes only the fixed API", await page.evaluate(() => JSON.stringify(Object.keys(window.vhsfx).sort())) === JSON.stringify(["autosave", "clearRecovery", "info", "listRecovery", "openProject", "pickFolder", "readRecovery", "saveProject", "showInFolder", "writeExport"]));
await page.getByRole("button", { name: "Got it" }).click();
check("40 factory presets listed", (await page.locator(".card").count()) === 40);

await page.getByRole("button", { name: "Play", exact: true }).click();
await page.waitForFunction(() => document.querySelector(".status")?.textContent?.startsWith("Ready"), null, { timeout: 30000 });
check("renders in the worker inside Electron", true, await page.locator(".status").textContent());

// export twice: second must not overwrite
await page.getByRole("button", { name: "Export", exact: true }).click();
await page.getByRole("button", { name: "Export", exact: true }).last().click();
await page.getByText(/^Saved .*\.wav/).first().waitFor({ timeout: 30000 });
const first = readdirSync(exportDir).filter((f) => f.endsWith(".wav"));
await page.getByRole("button", { name: "Export", exact: true }).last().click();
await page.waitForFunction(() => document.querySelectorAll(".results li").length >= 1 && /_2\.wav/.test(document.querySelector(".results")?.textContent ?? ""), null, { timeout: 30000 });
const files = readdirSync(exportDir);
check("export wrote a WAV and its recipe sidecar into the chosen folder", first.length === 1 && files.some((f) => f.endsWith(".recipe.json")), files.join(", "));
check("second export did not overwrite (numbered instead)", files.some((f) => /_2\.wav$/.test(f)) && files.filter((f) => f.endsWith(".wav")).length === 2);
check("no temp files left behind", !files.some((f) => f.endsWith(".tmp")));
check("Show in Folder is offered", (await page.getByRole("button", { name: "Show in Folder" }).count()) === 1);
try {
  const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_name,sample_rate,channels", "-of", "default=nw=1", join(exportDir, first[0])]).toString();
  check("exported WAV decodes in an independent tool", /pcm_s24le/.test(probe) && /sample_rate=48000/.test(probe), probe.replace(/\n/g, " "));
} catch (e) { if (e.code !== "ENOENT") throw e; console.log("SKIP  ffprobe not installed"); }
await page.screenshot({ path: join(shots, "desktop-export.png") });

// the IPC refuses unsafe names
const bad = await page.evaluate(async () => { try { await window.vhsfx.writeExport("../escape.wav", new Uint8Array(4)); return "accepted"; } catch (e) { return "rejected"; } });
check("IPC rejects a path-traversal file name", bad === "rejected");
check("nothing escaped the export folder", !existsSync(join(exportDir, "..", "escape.wav")));
await page.getByRole("button", { name: "Close", exact: true }).click();
// autosave recovery
await page.getByLabel("Pitch", { exact: true }).first().focus().catch(() => {});
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(3000);
const rec = join(userData, "recovery");
check("autosave wrote a recovery snapshot after an edit", existsSync(rec) && readdirSync(rec).some((f) => /^auto-\d+\.json$/.test(f)), existsSync(rec) ? readdirSync(rec).join(",") : "no recovery dir");
check("recovery snapshot is a valid project", (() => { try { const f = readdirSync(rec).find((n) => n.endsWith(".json")); const j = JSON.parse(readFileSync(join(rec, f), "utf8")); return j.format === "vhsfx-project" && j.recipe?.id; } catch { return false; } })());
// navigation is blocked
await page.evaluate(() => { location.href = "https://example.com/"; });
await page.waitForTimeout(500);
check("navigation away from the app is blocked", page.url().startsWith("vhsfx://app/"));

check("the app made no requests outside its own origin (works offline)", outside.length === 0, JSON.stringify(outside));
check("no console errors", errors.length === 0, JSON.stringify(errors));
// A page whose navigation was blocked can make a graceful close wait; end it like a crash would (recovery data must survive).
await Promise.race([app.close(), new Promise((r) => setTimeout(r, 4000))]);
try { app.process().kill("SIGKILL"); } catch { /* already gone */ }

// relaunch: recovery prompt appears
const app2 = await electron.launch(launchOpts());
const p2 = await app2.firstWindow();
await p2.getByRole("button", { name: "Got it" }).click().catch(() => {});
check("relaunch offers to recover unsaved work", (await p2.getByText("Recover unsaved work?").count()) === 1);
await p2.screenshot({ path: join(shots, "desktop-recovery.png") });
await p2.getByRole("button", { name: "Restore" }).click();
await p2.waitForTimeout(500);
check("restoring marks the document as unsaved", (await p2.locator(".dirty").count()) === 1);
await Promise.race([app2.close(), new Promise((r) => setTimeout(r, 4000))]);
try { app2.process().kill("SIGKILL"); } catch { /* already gone */ }

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} desktop checks passed`);
process.exit(failed.length ? 1 : 0);
