# Fugs MultiTrack Audio EX (v2.2)

Unlimited BGM / BGS / ME / SE tracks for **RPG Maker MV**, with fades, crossfades, effects, spatial audio, ducking, switch-gated commands, and SFX aliases.

The old single-file plugin is now a **Core + optional satellites** pack. Same command grammar and `FugsAudio` script API.

---

## Plugin pack (load order)

Copy these into your project's `js/plugins/` and enable top → bottom:

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
3. Enable **only** that file as Core (rename to `FugsMultiTrackAudioEX.js` if you want existing params to keep working), **or** keep the modular Core and do not also enable the individual satellites.
4. Still install `FugsAudio0Docs` / `FugsAudio8Test` separately if needed.

Do **not** enable both the bundle and `FugsAudio2…7` at once.

---

## Core parameters

Set on `FugsMultiTrackAudioEX` (filename = Plugin Manager param key; also reads `FugsAudio1Core` if present):

| Parameter | Default | Notes |
|-----------|---------|-------|
| Debug Logs | `2` (errors) | `1` silent … `4` verbose |
| Scene Fadeout Time | `0.5` | Seconds for auto scene fades |
| Default Doppler Scale | `1.0` | Used when Spatial is loaded |
| Default Persistence Mode | `scene` | `none` / `scene` / `battle` / `always` |
| Default Pause Mode | `battle` | `never` / `menu` / `battle` / `scene` |

If you later rename Core to `FugsAudio1Core.js`, params are dual-read (`FugsAudio1Core` then `FugsMultiTrackAudioEX`).

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

---

## Console testing (dev)

With `FugsAudio8Test` enabled, open the game console (F8):

```javascript
test("?")           // list tests
test("play")        // run play-* tests
await test("*")     // full suite (robot mode)
test.mode = "human" // longer waits so you can listen
```

Headless verification (Node, no MV project required):

```bash
node scripts/verify-all.js   # syntax + modular smoke + bundle build/smoke
node scripts/smoke.js        # modular pack only (50 assertions)
node scripts/build-bundle.js # rebuild dist/FugsMultiTrackAudioEX.bundle.js
```

Covers handler wiring, play/fade/pause/resume/stop, aliases, proximity/panSweep/sidechain/pump save-restore, orphan cleanup, and related bug fixes.

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
- [`docs/BUGS.md`](docs/BUGS.md) — confirmed defects (B01–B16 fixed as of 2026-08-09)
- [`scripts/verify-all.js`](scripts/verify-all.js) — offline verification gate
- [`dist/FugsMultiTrackAudioEX.bundle.js`](dist/FugsMultiTrackAudioEX.bundle.js) — generated all-in-one plugin
- `FugsAudio0Docs.js` — full in-Plugin-Manager playbook

---

## License

GPL-3.0 — see [`LICENSE`](LICENSE).
