/** Bridge to the desktop shell (Electron preload). In a normal browser `window.vhsfx` does not exist. */
export interface DesktopApi {
  info(): Promise<{ desktop: true; version: string; exportFolder: string | null }>;
  pickFolder(): Promise<{ folder: string | null }>;
  writeExport(name: string, data: Uint8Array | string): Promise<{ name: string }>;
  showInFolder(name: string): Promise<boolean>;
  saveProject(suggestedName: string, text: string): Promise<{ canceled: boolean; name?: string }>;
  openProject(): Promise<{ canceled: boolean; name?: string; text?: string }>;
  autosave(text: string): Promise<{ saved: boolean }>;
  listRecovery(): Promise<{ id: string; time: number }[]>;
  readRecovery(id: string): Promise<string>;
  clearRecovery(): Promise<boolean>;
}
declare global { interface Window { vhsfx?: DesktopApi } }
export const desktop = (): DesktopApi | undefined => (typeof window !== "undefined" ? window.vhsfx : undefined);
