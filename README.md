# Void Haulers SFX Lab

A local, offline sound-effects design tool for Void Haulers. Choose a sound, shape it with plain-language
controls, listen, and export game-ready WAV files. Everything is synthesised on your machine; there is no
account, network service or audio model. Claude can drive the same engine to help you fine-tune sounds.

**Status:** M0 and M1 are built, plus the CLI and a Claude (MCP) integration. The variations tray, A/B, the XY
performance pad, the other 35 factory presets and the Windows installer are not built yet. See
[docs/STATUS.md](docs/STATUS.md) for exactly what has been verified and what is pending.

## Run it (Windows)

1. Install [Node.js](https://nodejs.org) LTS (20 or newer).
2. Double-click **`Start SFX Lab.bat`**. The first run installs dependencies, then opens the app in your browser.

Or from a terminal: `npm install` then `npm start`. Chrome or Edge is recommended (they can save straight into a
folder you choose; other browsers save to Downloads).

## First sound

Pick **Heavy bulkhead close** on the left, press **Play**, move **Weight** and **Wear**, press Play again, then
**Export**. Nothing plays until you press Play. Your monitor level (bottom bar) affects listening only, never files.

## Claude integration

Claude uses the same renderer through an MCP server (stdio, no network port) or the `vh-sfx` command line.
Claude cannot hear. It measures renders (peak, RMS, spectrum bands, envelope, attack, decay, loop seam) and
relies on your listening notes ("too boomy", "attack too soft") to decide what to change.

**Claude Code:** open this folder in Claude Code; `.mcp.json` registers the server (approve it when asked).
To use it from any folder, register it at user scope with absolute paths:

```
claude mcp add --scope user vh-sfx-lab -e VH_SFX_WORKSPACE="C:\path\to\SoundStation\workspace" -- node "C:\path\to\SoundStation\node_modules\tsx\dist\cli.mjs" "C:\path\to\SoundStation\src\mcp\server.ts"
```

**Claude Desktop:** add to `claude_desktop_config.json`:

```json
{ "mcpServers": { "vh-sfx-lab": { "command": "node", "args": ["C:\\path\\to\\SoundStation\\node_modules\\tsx\\dist\\cli.mjs", "C:\\path\\to\\SoundStation\\src\\mcp\\server.ts"], "env": { "VH_SFX_WORKSPACE": "C:\\path\\to\\SoundStation\\workspace" } } } }
```

Tools: `list_presets`, `get_preset`, `validate_recipe`, `inspect_recipe`, `render`, `variations`, `analyze_wav`, `compare_wav`.
Renders land in `./workspace/renders` by default (git-ignored).

**Round trip with the app:** in the app use **Export** (writes `name.wav` plus `name.recipe.json`) or **Save**
(`.vhsfx.json`). Give Claude that file path; it renders tweaks and writes a new recipe. In the app press **Open**
and choose Claude's recipe file. See [CLAUDE.md](CLAUDE.md) for the tuning workflow Claude follows.

## Command line

```
node bin/vh-sfx.mjs list-presets [--query door] [--json]
node bin/vh-sfx.mjs show-preset energy-sidearm > my.json
node bin/vh-sfx.mjs render --preset heavy-bulkhead-close --set weight=80 --out out/door.wav
node bin/vh-sfx.mjs render --recipe my.json --out out/x.wav --channels stereo --encoding float32 --overwrite
node bin/vh-sfx.mjs variations --preset energy-sidearm --out-dir out --count 8 --strength subtle --lock space,decay
node bin/vh-sfx.mjs analyze out/door.wav --json
node bin/vh-sfx.mjs validate --recipe my.json
```

Exit codes: 0 ok, 2 invalid input, 3 missing/corrupt asset, 4 render failure, 5 write failure (including
refusing to overwrite without `--overwrite`). `--json` prints machine-readable results to stdout; diagnostics go to stderr.

## Develop

`npm test` (unit, engine and CLI, about 30 s) · `npm run typecheck` · `npm run build` ·
`npm run test:e2e` (needs `npm run dev` running and Chromium; drives the real UI).

Docs: [User guide](docs/USER_GUIDE.md) · [Architecture and deviations](docs/ARCHITECTURE.md) ·
[Preset authoring](docs/PRESET_AUTHORING.md) · [Status and gates](docs/STATUS.md)
