import { ENGINE_VERSION, type ExportSettings, type Recipe } from "../domain/schema";

/** Provenance file written beside each export. Paths are never absolute; assets are referenced by hash. */
export function sidecarFor(
  recipe: Recipe,
  settings: ExportSettings,
  r: { frames: number; audioSha256: string; output: { prePeakDbfs: number; postPeakDbfs: number; appliedGainDb: number }; loop: boolean; warnings: string[] },
  extra: Record<string, unknown> = {},
) {
  return {
    tool: "vh-sfx-lab", engineVersion: ENGINE_VERSION, recipeId: recipe.id, seed: recipe.seed,
    sampleRate: settings.sampleRate, channels: settings.channels, encoding: settings.encoding,
    frames: r.frames, loop: r.loop, audioSha256: r.audioSha256, output: r.output, warnings: r.warnings,
    sourceAssets: recipe.assets.map((a) => ({ id: a.id, hash: a.hash, originalName: a.originalName, license: a.license })),
    ...extra, recipe,
  };
}
