// End-to-end smoke test: drives the real UI in Chromium against a running dev server.
//   npm run dev        (in another terminal)
//   npm run test:e2e   (screenshots and the exported WAV go to ./workspace/e2e)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.VH_URL ?? "http://127.0.0.1:5173/";
const out = process.argv[2] ?? "workspace/e2e";
mkdirSync(out, { recursive: true });
const args = ["--autoplay-policy=no-user-gesture-required"];
const browser = await chromium.launch({ args }).catch(() => chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: [...args, "--no-sandbox"] }));
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await page.goto(BASE);
await page.getByRole("button", { name: "Got it" }).click();
await page.screenshot({ path: `${out}/01-start.png` });
console.log("title:", await page.title(), "| presets:", await page.locator(".card").count());
await page.getByLabel("Search sounds").fill("sidearm");
await page.locator(".card-main").first().click();
await page.getByLabel("Search sounds").fill("");
// Play renders then plays
await page.getByRole("button", { name: "Play", exact: true }).click();
await page.waitForFunction(() => document.querySelector(".status")?.textContent?.startsWith("Ready"), null, { timeout: 20000 });
console.log("status:", await page.locator(".status").textContent(), "|", await page.locator(".readouts span").nth(1).textContent());
await page.screenshot({ path: `${out}/02-played.png` });
// change a macro by keyboard -> becomes stale
const slider = page.getByLabel("Body", { exact: true }).first();
await slider.focus(); await slider.press("ArrowRight"); await slider.press("ArrowRight");
console.log("after edit:", await page.locator(".status").textContent());
// Advanced view
await page.getByRole("button", { name: "Advanced" }).click();
await page.getByRole("button", { name: "Play", exact: true }).click().catch(() => {});
await page.waitForFunction(() => document.querySelector(".status")?.textContent?.startsWith("Ready"), null, { timeout: 20000 });
await page.screenshot({ path: `${out}/03-advanced.png` });
console.log("layers lanes:", await page.locator(".lane").count());
// preset switch to loop preset via search
await page.getByLabel("Search sounds").fill("corridor");
await page.locator(".card-main").first().click();
await page.getByRole("button", { name: "Discard changes" }).click();
await page.getByRole("button", { name: /Play/ }).first().click();
await page.waitForFunction(() => document.querySelector(".status")?.textContent?.startsWith("Ready"), null, { timeout: 30000 });
await page.screenshot({ path: `${out}/04-loop.png` });
console.log("loop status:", await page.locator(".readouts span").nth(1).textContent());
console.log("seam text:", (await page.locator("text=Loop seam").first().textContent()).slice(0, 140));
// Export (download fallback)
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Export", exact: true }).click();
await page.screenshot({ path: `${out}/05-export.png` });
const dl = page.waitForEvent("download");
await page.getByRole("button", { name: "Export", exact: true }).last().click();
const d = await dl; await d.saveAs(`${out}/ui-export.wav`);
console.log("downloaded:", d.suggestedFilename());
// ---- Perform: capture a gesture on the XY pad and replay it
await page.getByRole("button", { name: "Close", exact: true }).click();
await page.getByLabel("Search sounds").fill("strained");
await page.locator(".card-main").first().click();
await page.getByRole("button", { name: "Discard changes" }).click({ timeout: 2000 }).catch(() => {});
await page.getByRole("tab", { name: /Perform/ }).click();
await page.screenshot({ path: `${out}/06-perform.png` });
await page.getByRole("button", { name: /Capture motion/ }).click();
await page.waitForSelector(".pad.capturing");
const box = await page.locator(".pad").boundingBox();
await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.9);
await page.mouse.down();
for (let i = 0; i <= 12; i++) { await page.mouse.move(box.x + box.width * (0.1 + 0.07 * i), box.y + box.height * (0.9 - 0.06 * i)); await page.waitForTimeout(150); }
await page.mouse.up();
await page.getByRole("button", { name: /Stop capture/ }).click();
await page.getByRole("tab", { name: "Perform ●" }).waitFor({ timeout: 8000 });
console.log("motion lanes:", await page.locator(".lane-edit").count());
await page.screenshot({ path: `${out}/07-captured.png` });
await page.getByRole("button", { name: "Play", exact: true }).click();
await page.waitForFunction(() => document.querySelector(".status")?.textContent?.startsWith("Ready"), null, { timeout: 20000 });
console.log("perform replay status:", await page.locator(".status").textContent());
console.log("errors:", JSON.stringify(errors));
if (errors.length) process.exitCode = 1;
await browser.close();
