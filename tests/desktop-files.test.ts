import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error plain ESM module without types
import { checkName, writeUnique } from "../desktop/files.mjs";

const dir = () => mkdtempSync(join(tmpdir(), "vhsfx-desk-"));

describe("desktop file safety", () => {
  it("accepts plain .wav/.json names and rejects traversal, separators, odd extensions", () => {
    expect(checkName("VH_Door_BulkheadClose_001.wav")).toBe("VH_Door_BulkheadClose_001.wav");
    for (const bad of ["../x.wav", "a/b.wav", "a\\b.wav", "..", "x.exe", "x.wav.exe", ".hidden.wav", "", "a".repeat(200) + ".wav", "C:evil.wav", "x\0.wav", 5, null])
      expect(() => checkName(bad as string), String(bad)).toThrow();
  });
  it("never overwrites: a taken name gets _2, _3 and the original is untouched", async () => {
    const d = dir();
    writeFileSync(join(d, "a.wav"), "original");
    expect(await writeUnique(d, "a.wav", Buffer.from("one"))).toBe("a_2.wav");
    expect(await writeUnique(d, "a.wav", Buffer.from("two"))).toBe("a_3.wav");
    expect(readFileSync(join(d, "a.wav"), "utf8")).toBe("original");
    expect(readFileSync(join(d, "a_3.wav"), "utf8")).toBe("two");
    expect(readdirSync(d).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
  it("concurrent writers of the same name all succeed with distinct files", async () => {
    const d = dir();
    const names = await Promise.all(Array.from({ length: 8 }, (_, i) => writeUnique(d, "same.wav", Buffer.from(String(i)))));
    expect(new Set(names).size).toBe(8);
    expect(readdirSync(d).length).toBe(8);
  });
  it("leaves nothing behind when the destination folder is missing", async () => {
    await expect(writeUnique(join(dir(), "nope"), "a.wav", Buffer.from("x"))).rejects.toThrow();
  });
  it("refuses names that would leave the folder even through a symlinked directory", async () => {
    const d = dir(), outside = dir();
    symlinkSync(outside, join(d, "link"));
    await expect(writeUnique(join(d, "link"), "../escape.wav", Buffer.from("x"))).rejects.toThrow();
    expect(readdirSync(outside)).toEqual([]);
  });
});
