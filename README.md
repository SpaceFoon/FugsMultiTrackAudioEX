# Fugs MultiTrack Audio EX (v2.3)

Unlimited BGM / BGS / ME / SE tracks for **RPG Maker MV and MZ**, with fades, crossfades, effects, spatial audio, ducking, switch-gated commands, and SFX aliases.

The old single-file plugin is now a **Core + optional satellites** pack. Same command grammar and `FugsAudio` script API on both engines.

| Engine | Status |
|--------|--------|
| **RPG Maker MZ** 1.x | Supported (desktop/NW.js, and web builds that stream audio in chunks). Verified offline against the real MZ 1.7.0 engine scripts. |
| **RPG Maker MV** 1.6.x (NW.js 0.29 / Chromium 65) | Supported. Verified offline against a model of MV's audio engine; plugin code is scanned for anything Chromium 65 cannot run. |

Details of what was checked, and what still needs a look inside a real project, are under [Verification](#verification).

---

## Plugin pack (load order)

Copy these into your project's `js/plugins/` (keep the file names) and enable top → bottom:

| Order | File | Required? | Role |
|------:|------|-----------|------|
| 1 | `FugsMultiTrackAudioEX.js` | **Yes** | Core mixer, parser, scene/save hooks, command registry |
| 2 | `FugsAudio0Docs.js` | Recommended | Full playbook in Plugin Manager help (no runtime) |
| 3 | `FugsAudio2Effects.js` | Optional | WebAudio effect chains + presets |
| 4 | `FugsAudio3Spatial.js` | Optional | Proximity, doppler, pan sweep |
| 5 | `FugsAudio4Dynamics.js` | Optional | Duck, pump, sidechain, pitchbendall |
| 6 | `FugsAudio5Switch.js` | Optional | `switch:N` gated commands |
| 7 | `FugsAudio6Aliases.js` | Optional | SFX alias pools + humanizer |
| 8 | `FugsAudio7Compat.js` | Optional | OcRam `fadeOutBgs` guard (place **after** OcRam) |
| 9 | `FugsAudio8Test.js` | **Dev only** | In-game `test()` suite — do not ship |

**Rules:** Core always first. Compat after OcRam. Test last. Missing optional plugins soft-warn and no-op (game still runs).

### Production

```
[OcRam_Audio_EX if used]
FugsMultiTrackAudioEX
FugsAudio0Docs
FugsAudio2Effects      ← as needed
FugsAudio3Spatial
FugsAudio4Dynamics
FugsAudio5Switch
FugsAudio6Aliases
FugsAudio7Compat
```

### Dev

Same as production, plus `FugsAudio8Test` at the bottom.

### All-in-one bundle (optional)

If you prefer a single Plugin Manager entry (soft-transition Option A):

1. Run `node scripts/build-bundle.js` (or use the prebuilt file).
2. Copy `dist/FugsMultiTrackAudioEX.bundle.js` into `js/plugins/`.
3. Enable **only** that file as Core (it reads its parameters under its own file name; rename it to `FugsMultiTrackAudioEX.js` if you want parameters you already set on the modular Core to carry over), **or** keep the modular Core and do not also enable the individual satellites.
4. Still install `FugsAudio0Docs` / `FugsAudio8Test` separately if needed.

Do **not** enable both the bundle and `FugsAudio2…7` at once.

---

## Running commands

The command text is identical on both engines (`play-bgm1 ThemeA 90 2`); only the place you type it differs.

**RPG Maker MV** — Event command **Plugin Command**, type the text as-is:

```text
play-bgm1 ThemeA 90 2
```

**RPG Maker MZ** — Event command **Plugin Command…** → plugin `FugsMultiTrackAudioEX` → command **Run Command**, and type the same text into its *Command* box. **Run Commands (one per line)** runs several in order (blank lines and lines starting with `//` or `#` are ignored). If you renamed the Core file, pick the plugin under its new name. Events imported from an MV project (**Plugin Command (MV)**) keep working unchanged, including quoted names with spaces.

**Either engine, from a Script call or the console:**

```javascript
FugsAudio.runCommandText("play-bgm1 ThemeA 90 2");
```

---

## Core parameters

Set them on the Core plugin in Plugin Manager. Parameters are read under the file name the Core was loaded as — so a renamed Core, or the bundle under its own name, keeps them — then under `FugsAudio1Core`, then `FugsMultiTrackAudioEX`:

| Parameter | Default | Notes |
|-----------|---------|-------|
| Debug Logs | `2` (errors) | `1` silent … `4` verbose |
| Scene Fadeout Time | `0.5` | Seconds for auto scene fades |
| Default Doppler Scale | `1.0` | Used when Spatial is loaded |
| Default Persistence Mode | `scene` | `none` / `scene` / `battle` / `always` |
| Default Pause Mode | `battle` | `never` / `menu` / `battle` / `scene` |

---

## Quick start

Plugin command examples:

```text
play-bgm1 ThemeA 90 2
fade-bgm1 0 2
crossfade-bgm1 BattleTheme 3
stop-bgm1 1
```

With satellites enabled:

```text
effect-bgm1 preset:cave
proximity-bgs1 {event:5, maxDistance:10}
duckall 0.3 0.5 2
registeralias Footstep {pool:[Step1,Step2], volumeJitter:5}
play-se1 alias:Footstep
```

Script API:

```javascript
FugsAudio.play({ type: "bgm", trackId: 1, name: "ThemeA", volume: 90, fadein: 2 });
FugsAudio.fade("bgm", 1, { volume: 0, duration: 2 });
FugsAudio.stop("bgm", 1, 1);
```

Full playbook: enable `FugsAudio0Docs` and open it in Plugin Manager.

### Things to know

- Fugs tracks play at the volume you give them and **ignore the Options-menu BGM/BGS/ME/SE sliders** (the engine's master volume still applies).
- Entering a battle follows the persistence × pause table in `FugsAudio0Docs` (Continues / Pauses / Stops). Tracks that *Pause* come back where they left off when the battle ends, and tracks that Pause or Continue are still there afterwards; a `(p:none)` track started *during* the battle ends with it. `(pause:scene)` tracks resume automatically at the next map scene.
- There is no automatic stop on **Game Over** (the title screen does stop tracks); stop them yourself if you need silence there.
- Effects requested before a file has finished loading are applied automatically once it starts playing.
- A missing file logs `Could not load audio/<type>/<name>` and the track slot is freed.
- On MZ web builds, resuming a paused track creates a new buffer, which downloads the file again.

---

## Console testing (dev)

With `FugsAudio8Test` enabled, open the game console (F8):

```javascript
test("?")           // list tests
test("play")        // run play-* tests
await test("*")     // full suite (robot mode)
test.mode = "human" // longer waits so you can listen
```

The in-game suite runs on MV and MZ (NW.js). It needs Node integration (`require`) for its audio-folder scan, so it is meant for desktop playtests, not web builds.

---

## Verification

Everything below runs headless in Node 18+, no RPG Maker project needed:

```bash
node scripts/verify-all.js                # the whole gate (add --fast to skip the bundle re-run)
node scripts/smoke.js                     # modular pack only (50 assertions)
node scripts/build-bundle.js              # rebuild dist/FugsMultiTrackAudioEX.bundle.js
node scripts/check-mv-compat.js           # syntax/APIs newer than MV's Chromium 65?
node --test scripts/tests/*.test.js       # engine scenarios on the MV and MZ models
```

### Engine scenarios (`scripts/harness`, `scripts/tests`)

The mocks the first smoke tests used were too loose to see engine differences, so there is a proper harness: a deterministic virtual clock (timers, animation frames, `performance.now`, `AudioContext.currentTime`), a strict fake Web Audio graph (real `connect`/`disconnect` rules, `AudioParam` automation, playback-position integration), and engine backends that the whole pack is loaded into exactly as a game does (plugins first, audio context afterwards). Assertions look at the audio graph, i.e. what a listener would hear — not at the plugin's own bookkeeping.

About 160–170 scenarios per backend cover boot, every command family, play/pause/resume/stop and end-of-track cleanup, pitch/seek accuracy, scene/battle/menu persistence and pause policies, save/load (including MZ's Promise-based `DataManager`), effects and presets, proximity/doppler/pan sweep, duck/pump/sidechain, switches, aliases, OcRam compat, missing files, MZ chunked streaming over http, MV on Android Chrome, disabled audio — and the shipped in-game `test()` suite itself.

| Backend | How it is built | Selected by |
|---------|-----------------|-------------|
| MV (model) | Re-implementation of rpg_core 1.6 `WebAudio`/`AudioManager` behaviour (single source node, `isPlaying()` false until decoded, …) | always |
| MZ (model) | Model of MZ's `WebAudio` (source-node array, chunked decode, `destroy()`, Promise `DataManager`) — checked against the real 1.7.0 scripts: identical results | always |
| MZ (real scripts) | The actual `rmmz_*.js` files of your MZ project | `RMMZ_JS_DIR=/path/to/project/js` |
| MV (real scripts, experimental) | The actual `rpg_*.js` files of your MV project | `RMMV_JS_DIR=/path/to/project/js` |

Other switches: `HARNESS_ONLY=mz` (comma list of `mv,mz,mz-real,mv-real`) limits the backends; `HARNESS_BUNDLE=1` runs everything against `dist/FugsMultiTrackAudioEX.bundle.js` instead of the modular files. The RPG Maker engine scripts are proprietary and are not part of this repository.

### What is *not* verified here

- **Sound.** The graph is checked, not the audio itself; run `test("*")` with `test.mode = "human"` and listen.
- **Real MV scripts.** MV is verified against a model; point `RMMV_JS_DIR` at a project to try the real ones (experimental) and give your first MV playtest a look.
- **The MZ editor UI** (does *Run Command* show up with its text box) can only be checked in the editor.

### Code that must run on MV

MV 1.6 runs plugins in NW.js 0.29 (Chromium 65). `scripts/check-mv-compat.js` fails the gate on syntax or APIs Chromium 65 lacks (`?.`, `??`, `Object.fromEntries`, `Array.prototype.flat`, `globalThis`, …) in every plugin file and in the bundle.

---

## Migration from the old monolith

1. Replace the single `FugsMultiTrackAudioEX.js` with the files in this repo (same Core filename keeps your Plugin Manager params).
2. Enable Core + the satellites you need (see load order above).
3. Add `FugsAudio0Docs` if you want the full in-editor help.
4. Keep `FugsAudio8Test` off in shipped builds.

Command syntax and `contents.fugsAudio` save data are unchanged.

---

## Docs in this repo

- [`docs/MULTI_PLUGIN_SPLIT_PLAN.md`](docs/MULTI_PLUGIN_SPLIT_PLAN.md) — split architecture and phases
- [`docs/BUGS.md`](docs/BUGS.md) — defects found and fixed (B01–B16 code review, B17–B34 MV/MZ compatibility audit)
- [`scripts/verify-all.js`](scripts/verify-all.js) — offline verification gate
- [`dist/FugsMultiTrackAudioEX.bundle.js`](dist/FugsMultiTrackAudioEX.bundle.js) — generated all-in-one plugin
- `FugsAudio0Docs.js` — full in-Plugin-Manager playbook

---

## License

GPL-3.0 — see [`LICENSE`](LICENSE).
