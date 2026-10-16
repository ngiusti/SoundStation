import { describe, expect, it } from "vitest";
import { initialState, reducer, HISTORY_LIMIT } from "../src/ui/state";
import { getPreset } from "../src/presets";
import { cloneRecipe } from "../src/domain/clone";

const start = () => initialState(cloneRecipe(getPreset("heavy-bulkhead-close")!), "heavy-bulkhead-close");

describe("A15 undo/redo", () => {
  it("restores macros, timing, crop and fades; view changes keep the sound and revision", () => {
    let s = start();
    const original = JSON.stringify(s.recipe);
    s = reducer(s, { type: "edit", fn: (d) => { d.macros[0].value = 90; } });
    s = reducer(s, { type: "edit", fn: (d) => { d.layers[2].startSeconds = 1.2; } });
    s = reducer(s, { type: "edit", fn: (d) => { d.master.crop = { startSeconds: 0.1, endSeconds: 2.0 }; d.master.fadeOutMs = 40; } });
    const edited = JSON.stringify(s.recipe);
    const rev = s.revision;
    s = reducer(s, { type: "view", view: "advanced" });
    s = reducer(s, { type: "select", layerId: "clang" });
    expect(s.revision).toBe(rev);
    expect(JSON.stringify(s.recipe)).toBe(edited);
    for (let i = 0; i < 3; i++) s = reducer(s, { type: "undo" });
    expect(JSON.stringify(s.recipe)).toBe(original);
    for (let i = 0; i < 3; i++) s = reducer(s, { type: "redo" });
    expect(JSON.stringify(s.recipe)).toBe(edited);
  });
  it("rejects invalid edits without changing the recipe or history", () => {
    let s = start();
    const r0 = JSON.stringify(s.recipe);
    s = reducer(s, { type: "edit", fn: (d) => { d.layers[0].gainDb = 999; } });
    expect(JSON.stringify(s.recipe)).toBe(r0);
    expect(s.past.length).toBe(0);
    expect(s.notice).toMatch(/not applied/);
  });
  it("keeps at most 100 undo steps", () => {
    let s = start();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) s = reducer(s, { type: "edit", fn: (d) => { d.macros[0].value = (i % 99) + 1; } });
    expect(s.past.length).toBe(HISTORY_LIMIT);
  });
});
