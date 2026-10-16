// Preload: exposes a small, fixed API to the page. No Node objects, no paths, no generic file access.
const { contextBridge, ipcRenderer } = require("electron");
const call = (ch, ...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld("vhsfx", {
  info: () => call("vhsfx:info"),
  pickFolder: () => call("vhsfx:pickFolder"),
  writeExport: (name, data) => call("vhsfx:writeExport", name, data),
  showInFolder: (name) => call("vhsfx:showInFolder", name),
  saveProject: (suggestedName, text) => call("vhsfx:saveProject", suggestedName, text),
  openProject: () => call("vhsfx:openProject"),
  autosave: (text) => call("vhsfx:autosave", text),
  listRecovery: () => call("vhsfx:listRecovery"),
  readRecovery: (id) => call("vhsfx:readRecovery", id),
  clearRecovery: () => call("vhsfx:clearRecovery"),
});
