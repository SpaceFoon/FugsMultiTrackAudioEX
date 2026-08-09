# FugsMultiTrackAudioEX — Known Bugs

**Source:** `FugsMultiTrackAudioEX.js`  
**Last updated:** 2026-08-09  
**Status legend:** Open · Fixed · Confirmed in code · Fix not applied

This file tracks confirmed defects found by code review. Severity reflects user impact under default or common setups.

> **Status (2026-08-09):** All 16 confirmed bugs (B01–B16) are fixed. Each was verified with isolated Node smoke tests simulating the RPG Maker MV audio environment. Fixes span the core (`FugsMultiTrackAudioEX.js`) and the `FugsAudio2Effects` / `FugsAudio3Spatial` / `FugsAudio4Dynamics` satellites.

---

## Summary

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| B01 | Critical | Battle auto-pause never resumes | **Fixed** |
| B02 | High | Plugin commands drop `(loop:…)` | **Fixed** |
| B03 | High | Re-pausing wipes saved seek position | **Fixed** |
| B04 | High | Resume of one-shot tracks never re-arms end cleanup | **Fixed** |
| B05 | High | Event-bound proximity frozen while player stands still | **Fixed** |
| B06 | High | Save/load drops proximity (and related spatial state) | **Fixed** |
| B07 | High | Re-calling `sidechain` leaks old connections | **Fixed** |
| B08 | Medium | FadeManager can double-fire `onComplete` | **Fixed** |
| B09 | Medium | `cleanupOrphanedTracks` drops buffers without release/stop | **Fixed** |
| B10 | Medium | Effect crossfade half-duration race | **Fixed** |
| B11 | Medium | Sidechain attack/release times wrong (~sampleRate vs frame) | **Fixed** |
| B12 | Medium | Paused save restore can blip or lose seek position | **Fixed** |
| B13 | Medium | Per-type “all” commands hit paused tracks; global “all” skips them | **Fixed** |
| B14 | Medium | Proximity gated on tile coords, not smooth movement | **Fixed** |
| B15 | Low–Medium | Manual resume doesn’t refresh proximity volume | **Fixed** |
| B16 | Low | Pause-with-fadeout blocks resume until timeout | **Fixed** |

---

## Confirmed bugs

### B01 — Critical: Battle auto-pause never resumes — **FIXED 2026-08-09**

**Where:** `Scene_Battle.prototype.terminate`, `Scene_Menu.prototype.terminate`, `handleSceneTransition`

**What was wrong:** Default `pauseMode: battle` paused tracks on battle enter, but battle exit never resumed them.

**Fix:** Battle→map terminate now resumes `_pauseMode === "battle"` tracks (mirrors menu), then runs `handleSceneTransition("scene")`.

---

### B02 — High: Plugin commands drop `(loop:…)` — **FIXED**

**Where:** `Game_Interpreter.prototype.pluginCommand` `commandObj`

**What was wrong:** Parsing returned `loop`, but the live plugin-command path never copied it into `commandObj`.

**Fix:** `commandObj` now includes `loop: parsed.loop` (and `effect`).

---

### B03 — High: Re-pausing wipes saved seek position — **FIXED 2026-08-09**

**Where:** `pauseAudio`

**What was wrong:** No “already paused” guard. A second pause called `buffer.seek()` on a stopped buffer (often `0`) and overwrote `pausedSnapshots`.

**Fix:** Early-return if `pausedTracks.has(key)` (keeps snapshot). Works with B16 immediate pause marking.

---

### B04 — High: Resume of one-shot tracks never re-arms end cleanup — **FIXED 2026-08-09**

**Where:** `resumeAudio` / `playAudio` end timers

**What was wrong:** Pause cancelled end timers; resume recreate path didn’t re-arm them for `never` one-shots.

**Fix:** Shared `_scheduleTrackEndAction()` used by `playAudio` and both resume paths (recreate + in-progress pause cancel).

---

### B05 — High: Event-bound proximity frozen while player stands still — **FIXED 2026-08-09**

**Where:** `FugsAudio3Spatial.js` `onUpdate` hook, `updateProximityVolume`

**What was wrong:** Proximity only updated when `$gamePlayer.x` / `$gamePlayer.y` (tile coords) changed. Event-following sources use event `_realX`/`_realY`, but that logic never ran if the player didn't change tiles.

**Fix:** The Spatial `onUpdate` hook now calls `updateProximityVolume()` every frame while `proximityData.size > 0`. That function already has a per-key `_realX`/`_realY` dirty check (and always recomputes for doppler), so idle frames stay cheap while event-follow and sub-tile movement update smoothly (also resolves B14).

**Triggers:** `proximity-bgm1 {event:5,...}` (or doppler); stand still; move the event toward/away. Volume/pan stay frozen until the player moves.

**Suggested fix:** Dirty-flag on event movement, or call `updateProximityVolume()` every frame while `proximityData.size > 0`.

---

### B06 — High: Save/load drops proximity (and related spatial state) — **FIXED 2026-08-09**

**Where:** `captureTrackState` / `loadTrackState` (core), new `_runCaptureHooks` / `_runRestoreHooks`, `FugsAudio3Spatial.js` capture/restore hooks

**What was wrong:** Saved state was mixer-only. `proximityData` was never serialized, and restore just did `playAudio()` (+ optional pause) with no spatial re-bind.

**Fix:** The extension contract's capture/restore hooks are now wired. `captureTrackState` attaches `state.ext = _runCaptureHooks(key)`; `loadTrackState` calls `_runRestoreHooks(key, state.ext)` after the track is recreated. Spatial persists `ext.proximity` + `ext.panSweep`; Dynamics persists `ext.sidechains` (on both source and target keys). Active pump is stored in reserved save key `__fugsMeta` via global capture/restore hooks. `loadAllStates` runs a second per-track restore pass, then applies `__fugsMeta`. Transient runtime fields are reset; pan sweeps restart via `startPanSweep`.

**Triggers:** Set proximity → save → load (or `saveall`/`loadall`). Track plays at wrong volume/pan; spatial behavior is gone.

---

### B07 — High: Re-calling `sidechain` leaks old connections — **FIXED 2026-08-09**

**Where:** `FugsAudio4Dynamics.js` `setupSidechain`

**What was wrong:** Always created a new analyser + RAF loop and `sidechainConnections.set(...)` without disposing an existing entry for the same `sourceId_to_targetId`. Old RAF/analyser kept running.

**Fix:** Before storing the new connection, if one already exists for `connectionKey` it is disposed via `_disposeSidechainConnection(..., { restoreTarget: false })` (cancels its RAF, disconnects the analyser tap, deletes the map entry). `restoreTarget: false` avoids a gain blip since the new follower immediately drives the target.

**Triggers:** Run `sidechain-bgm 1 2 ...` twice with the same source/target. Multiple envelope loops fight over target gain; Web Audio nodes leak.

---

### B08 — Medium: FadeManager can double-fire `onComplete` — **FIXED 2026-08-09**

**Where:** `FadeManager.update`

**What was wrong:** RAF and the 100ms watchdog could both run `update()`, and `onComplete` fired while the fade was still in `activeFades` (deletion happened after the loop). A re-entrant `update()` — or an `onComplete` that synchronously drove another fade — could fire the same completion twice.

**Fix:** Each fade now carries its `key`. In `update()`, completed fades are marked `_completed`, then **removed from `activeFades` before** any `onComplete` runs; the loop also skips `_completed` fades. A re-entrant `update()` can no longer observe or re-fire a finished fade.

**Triggers:** Tab backgrounded / RAF stall near fade end; heavy GC.

---

### B09 — Medium: `cleanupOrphanedTracks` drops buffers without release/stop — **FIXED 2026-08-09**

**Where:** `cleanupOrphanedTracks`, new `_stopBufferSafely` helper

**What was wrong:** “Dead”/corrupted tracks got `cleanupTrack()` only — which tears down maps/fades/effects but never calls `buffer.stop()` or `_releaseBuffer()`. A still-playing (or spuriously not-playing) buffer kept its decoded PCM + WebAudio nodes alive until GC, on every scene transition.

**Fix:** Both the orphaned and corrupted branches now `_stopBufferSafely(buffer)` → `cleanupTrack(key)` → `_releaseBuffer(buffer)`. `_stopBufferSafely` guards against missing/already-stopped `stop()`.

**Triggers:** Finished SE still mapped with `isPlaying() === false`; spurious `isPlaying` false mid-gap.

---

### B10 — Medium: Effect crossfade half-duration race — **FIXED 2026-08-09**

**Where:** `FugsAudio2Effects.js` `crossFadeEffect`, `applyEffect`

**What was wrong:** The fade-out cleanup timeout and the mid-point `fadeEffect` both targeted the same key/`effectChains` entry. `fadeOutEffect`'s cleanup already guards on chain identity (so the intra-crossfade ordering was safe), but **interleaved** crossfades / a plain `effect` command mid-crossfade could let a stale mid-point timeout clobber the newer chain.

**Fix:** Added a per-key generation token (`_effectCrossfadeGen`). `crossFadeEffect` bumps it at start and its mid-point timeout aborts if the token changed; `applyEffect` also bumps it so any direct effect apply supersedes a pending crossfade.

**Triggers:** `crossfadeEffects` / effect crossfade under load or with short durations, or a new effect issued during a crossfade.

---

### B11 — Medium: Sidechain attack/release times wrong (~sampleRate vs frame) — **FIXED 2026-08-09**

**Where:** `FugsAudio4Dynamics.js` `setupSidechain` envelope coeffs

**What was wrong:** Envelope smoothing ran in a RAF callback (~60 Hz) but used `Math.exp(-1 / (attack * context.sampleRate))`. `sampleRate` is per-sample, not per-frame, so attack/release behaved like multi-second envelopes instead of documented seconds.

**Fix:** Coeffs now use the real frame delta: `dt = clamp(now - lastFrameTime, 0.001, 0.1)` (first frame `1/60`), then `attackCoeff = Math.exp(-dt / attack)` (same for release). Attack/release args now behave as documented seconds.

**Triggers:** `sidechain-bgm 1 2 0.5 4 0.01 0.1` — ducking/release is sluggish regardless of attack/release args.

---

### B12 — Medium: Paused save restore can blip or lose seek position — **FIXED 2026-08-09**

**Where:** `loadTrackState` → new `_restorePausedTrack` (core)

**What was wrong:** Restore called `playAudio()` then immediately `pauseAudio([0])` with no wait for decode/load. On a cold buffer `seek()` returned 0 (losing position) and playback could audibly start before the stop.

**Fix:** Paused restore now goes through `_restorePausedTrack`: if the buffer isn't ready it defers the pause via `addLoadListener` (so nothing plays before it's stopped), and after pausing it overwrites the snapshot position (`snap.pos` / `buffer._pausedPos`) with the authoritative saved `state.currentTime` instead of trusting `seek()`.

**Triggers:** Save while paused mid-song → load on slow/cold cache. Brief audio blip and/or wrong resume position.

---

### B13 — Medium: Per-type “all” commands hit paused tracks; global “all” skips them — **FIXED 2026-08-09**

**Where:** `fadeAllOfType` (core), `duckAllOfType` / `pitchBendAll` / `pitchBendAllOfType` (`FugsAudio4Dynamics.js`)

**What was wrong:** Global `fadeAllAudio` / `duckAllAudio` skip `pausedTracks`, but the per-type paths and `pitchBendAll*` did not. Changes applied to the stopped buffer (not `pausedSnapshots`), so resume restored pre-pause values.

**Fix:** Added the same `if (this.pausedTracks && this.pausedTracks.has(key)) continue;` guard to `fadeAllOfType`, `duckAllOfType`, `pitchBendAll`, and `pitchBendAllOfType`, matching the global paths.

**Triggers:** Auto-pause BGM → `fadeall-bgm 30 2` or `duckall-bgm 0.3 1 2` → resume. Volume unchanged from snapshot; duck appeared to do nothing.

---

### B14 — Medium: Proximity gated on tile coords, not smooth movement — **FIXED 2026-08-09**

**Where:** `FugsAudio3Spatial.js` `onUpdate` hook

**What was wrong:** Even for fixed sources, proximity only recalculated when the player crossed a tile boundary, not while moving within/between tiles. Volume/pan stepped instead of updating smoothly.

**Fix:** Same change as B05 — the `onUpdate` hook now recomputes every frame while proximity is active, and `updateProximityVolume` compares `_realX`/`_realY` (with a per-key dirty check), so fixed-source volume/pan track smooth movement.

**Triggers:** Proximity on a fixed map point; walk slowly. Updates happen in tile jumps.

---

### B15 — Low–Medium: Manual resume doesn’t refresh proximity volume — **FIXED 2026-08-09**

**Where:** `resumeAudio`

**What was wrong:** Resume rebuilt the buffer but never refreshed proximity loudness.

**Fix:** Call `updateProximityVolume()` after successful resume when `proximityData.has(key)` (recreate + in-progress pause cancel paths).

---

### B16 — Low: Pause-with-fadeout blocks resume until timeout — **FIXED 2026-08-09**

**Where:** `pauseAudio` / `resumeAudio`

**What was wrong:** `pausedTracks` was only set when the fadeout timeout fired, so immediate resume failed.

**Fix:** Add to `pausedTracks` immediately; resume cancels pending stop timeout + fades; if buffer still playing, restore mixer without recreating.

---

## Risky / unconfirmed

These look wrong or fragile but need runtime confirmation or sharper repros before promoting to confirmed bugs.

| Area | Notes | Approx. lines |
|------|-------|---------------|
| `syncPlay` / `startSyncedBuffers` | Schedules a future context time but never uses it; starts are only “close enough” (admitted in comments). | sync helpers |
| `ensurePumpNode` + sidechain | `gainNode.disconnect()` with no args can sever analyzer taps. | pump / sidechain |
| `loadGame` ordering | `handleSceneTransition` then 100ms `loadAllStates("auto")` can race with prior fadeouts / context readiness. | ~7914–7922 |
| `stopAllOfType` / `fadeAllOfType` | `key.startsWith(type)` is coarse (fine for `bgm`/`bgs`/`se`/`me` today). | ~5005+ |
| Switch OFF | Only auto-stops `play` actions; fade/duck/effect switch commands don’t reverse except via duck restore. | SwitchBuffer |
| `pluginCommand` quote re-parse | Only a subset of prefixes get full-string re-parse; `fadeall-*`, `duckall-*`, `chain-*`, `registeralias`, etc. may mishandle quoted names with spaces. | ~8055–8058 |
| Runtime `sfxAliases` | Aliases from `registeralias` are not in save data — lost on load. | alias + save |
| No `Scene_Gameover` hook | Unlike `Scene_Title`, game over doesn’t auto-stop tracks. | ~7908–7911 vs missing |
| `syncplay` without type | Parses as `type: "all"` → keys like `all_1` if dashless command used. | ~6873–6876, ~4409–4410 |
| Sidechain vs proximity/fades | Direct `_gainNode.gain` writes bypass `buffer.volume` and fight proximity/fade updates on the same target. | ~4613–4619 |

---

## Review history

| Date | Coverage |
|------|----------|
| 2026-07-16 | Initial pass: playback, fades, pause/resume, scene/battle hooks, switches, effects, sidechain, save/load, command parsing |
| 2026-07-16 | Second pass: proximity, sidechain timing/leaks, save/load spatial state, bulk fade/duck consistency, gameover/alias risks |

---

## Fix priority (suggested)

1. ~~**B01**~~ **fixed** — battle resume.
2. ~~**B02**~~ **fixed** — plugin-command `loop`.
3. ~~**B03 / B04 / B16 / B15**~~ **fixed** — pause/resume cluster.
4. **B05 / B14** — Proximity update cluster (every-frame / realXY dirty flag).
5. **B06 / B12** — Save/load fidelity.
6. **B07 / B11** — Sidechain correctness + leak.
7. **B08–B10, B13** — Fade/cleanup races and bulk-command consistency.
