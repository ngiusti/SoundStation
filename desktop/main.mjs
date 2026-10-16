// Void Haulers SFX Lab - Electron main process.
// Security model (see https://www.electronjs.org/docs/latest/tutorial/security): the renderer is sandboxed with
// context isolation and no Node. It talks to this process only through the narrow, validated IPC below, which
// never accepts a path from the renderer: files are written inside a folder the user picked in a native dialog.
import { app, BrowserWindow, dialog, ipcMain, net, protocol, session, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkName, toBuffer, writeUnique } from "./files.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(here, "..", "dist");
const ORIGIN = "vhsfx://app";
const DEV_URL = process.env.VH_DEV_URL || null; // development only: load the Vite dev server instead of dist/
const TEST_DIR = process.env.VH_TEST_EXPORT_DIR || null; // test seam: skips the native folder dialog
const MAX_FILE = 512 * 1024 * 1024; // keep in step with files.mjs
const RECOVERY_KEEP = 3;
const RECOVERY_CAP = 300 * 1024 * 1024;

protocol.registerSchemesAsPrivileged([{ scheme: "vhsfx", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

/** @type {BrowserWindow | null} */
let win = null;
/** Folder chosen for exports. Kept here, never supplied by the renderer. */
let exportDir = TEST_DIR ? path.resolve(TEST_DIR) : null;

function isTrusted(event) {
  if (!win || event.sender !== win.webContents) return false;
  const url = event.senderFrame?.url ?? "";
  return url.startsWith(ORIGIN + "/") || (DEV_URL !== null && url.startsWith(DEV_URL));
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrusted(event)) throw new Error("Blocked: request did not come from the app window.");
    return fn(...args);
  });
}

function registerIpc() {
  handle("vhsfx:info", () => ({ desktop: true, version: app.getVersion(), exportFolder: exportDir ? path.basename(exportDir) : null }));
  handle("vhsfx:pickFolder", async () => {
    const r = await dialog.showOpenDialog(win, { title: "Choose a folder for exported sounds", properties: ["openDirectory", "createDirectory"] });
    if (r.canceled || !r.filePaths[0]) return { folder: exportDir ? path.basename(exportDir) : null };
    exportDir = r.filePaths[0];
    return { folder: path.basename(exportDir) };
  });
  handle("vhsfx:writeExport", async (name, data) => {
    checkName(name);
    if (!exportDir) throw new Error("Choose an export folder first.");
    return { name: await writeUnique(exportDir, name, toBuffer(data)) };
  });
  handle("vhsfx:showInFolder", async (name) => {
    checkName(name);
    if (!exportDir) throw new Error("No export folder.");
    const target = path.join(await fs.realpath(exportDir), name);
    await fs.access(target);
    shell.showItemInFolder(target);
    return true;
  });
  handle("vhsfx:saveProject", async (suggested, text) => {
    const r = await dialog.showSaveDialog(win, { title: "Save project", defaultPath: String(suggested).replace(/[^A-Za-z0-9._ -]/g, "_"), filters: [{ name: "SFX Lab project", extensions: ["json"] }] });
    if (r.canceled || !r.filePath) return { canceled: true };
    const buf = toBuffer(text);
    if (buf.length > MAX_FILE) throw new Error("That project is too large to save.");
    const tmp = r.filePath + ".tmp";
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, r.filePath); // atomic replace: the user chose this path and confirmed overwrite in the dialog
    return { canceled: false, name: path.basename(r.filePath) };
  });
  handle("vhsfx:openProject", async () => {
    const r = await dialog.showOpenDialog(win, { title: "Open project or recipe", properties: ["openFile"], filters: [{ name: "SFX Lab project or recipe", extensions: ["json"] }] });
    if (r.canceled || !r.filePaths[0]) return { canceled: true };
    const st = await fs.stat(r.filePaths[0]);
    if (st.size > MAX_FILE) throw new Error("That file is too large to open.");
    return { canceled: false, name: path.basename(r.filePaths[0]), text: await fs.readFile(r.filePaths[0], "utf8") };
  });

  // Autosave recovery: rolling snapshots in app data, separate from the saved project.
  const recDir = () => path.join(app.getPath("userData"), "recovery");
  const prune = async () => {
    const files = (await fs.readdir(recDir()).catch(() => [])).filter((f) => /^auto-\d+\.json$/.test(f)).sort().reverse();
    let total = 0;
    for (let i = 0; i < files.length; i++) {
      const st = await fs.stat(path.join(recDir(), files[i]));
      total += st.size;
      if (i >= RECOVERY_KEEP || total > RECOVERY_CAP) await fs.rm(path.join(recDir(), files[i]), { force: true });
    }
  };
  handle("vhsfx:autosave", async (text) => {
    const buf = toBuffer(text);
    if (buf.length > RECOVERY_CAP) return { saved: false };
    await fs.mkdir(recDir(), { recursive: true });
    const file = path.join(recDir(), `auto-${Date.now()}.json`);
    await fs.writeFile(file + ".tmp", buf);
    await fs.rename(file + ".tmp", file);
    await prune();
    return { saved: true };
  });
  handle("vhsfx:listRecovery", async () => {
    const files = (await fs.readdir(recDir()).catch(() => [])).filter((f) => /^auto-\d+\.json$/.test(f)).sort().reverse();
    return files.slice(0, 1).map((f) => ({ id: f, time: Number(f.slice(5, -5)) }));
  });
  handle("vhsfx:readRecovery", async (id) => {
    if (!/^auto-\d+\.json$/.test(String(id))) throw new Error("Invalid recovery id.");
    return fs.readFile(path.join(recDir(), id), "utf8");
  });
  handle("vhsfx:clearRecovery", async () => {
    for (const f of await fs.readdir(recDir()).catch(() => [])) if (/^auto-\d+\.json(\.tmp)?$/.test(f)) await fs.rm(path.join(recDir(), f), { force: true });
    return true;
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640, backgroundColor: "#121417", title: "Void Haulers SFX Lab", show: false,
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false },
  });
  win.once("ready-to-show", () => win?.show());
  win.setMenuBarVisibility(false);
  // Never navigate away from the app and never open new windows.
  win.webContents.on("will-navigate", (e, url) => { if (!(url.startsWith(ORIGIN + "/") || (DEV_URL && url.startsWith(DEV_URL)))) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.on("closed", () => { win = null; });
  void win.loadURL(DEV_URL ?? `${ORIGIN}/index.html`);
}

app.whenReady().then(() => {
  // Serve dist/ from a custom origin: works offline and without file:// quirks (module workers, CSP 'self').
  protocol.handle("vhsfx", (request) => {
    const url = new URL(request.url);
    if (url.host !== "app") return new Response("Not found", { status: 404 });
    const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST + path.sep)) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // No device, camera or notification permissions are ever needed.
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  registerIpc();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
