# FugsMultiTrackAudioEX — Known Bugs

**Source:** `FugsMultiTrackAudioEX.js`  
**Last updated:** 2026-09-30  
**Status legend:** Open · Fixed · Confirmed in code · Fix not applied

This file tracks confirmed defects found by code review. Severity reflects user impact under default or common setups.

> **Status (2026-08-09):** All 16 confirmed bugs (B01–B16) are fixed. Each was verified with isolated Node smoke tests simulating the RPG Maker MV audio environment. Fixes span the core (`FugsMultiTrackAudioEX.js`) and the `FugsAudio2Effects` / `FugsAudio3Spatial` / `FugsAudio4Dynamics` satellites.

> **Status (2026-09-30, v2.3):** A compatibility audit against engine models (MV 1.6, MZ 1.x) and the real MZ 1.7.0 scripts found 20 further defects (B17–B36): 6 that made the pack unusable or badly broken on **MZ** (before the fixes only 10 of 137 scenarios passed there), and 14 that hit **MV** (and MZ) — the original code passed 113 of 131 on the MV model. All are fixed and covered by the scenarios in `scripts/tests/` (see [README → Verification](../README.md#verification)). The earlier smoke tests could not see them: their `AudioManager`/`WebAudio` stubs ignored the folder argument, had no source nodes, and made `isPlaying()` synchronous.

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
| B17 | Critical | MZ: nothing plays (wrong audio URL) | **Fixed** |
| B18 | Critical | MZ: effects never connect; every pitch change restarts the track | **Fixed** |
| B19 | Critical | MZ: no plugin commands exist | **Fixed** |
| B20 | High | MZ: save restore runs before the save is loaded | **Fixed** |
| B21 | High | MZ (web): progressive decode replaces source nodes — routing lost, one-shots cut short | **Fixed** |
| B22 | Medium | MZ: released buffers stay in memory (`destroy()` never called) | **Fixed** |
| B23 | High | Tracks auto-paused for battle vanish on return | **Fixed** |
| B24 | High | `seek()` drifts after pitch changes; low-pitched one-shots cut short | **Fixed** |
| B25 | High | Effects requested while the file is still loading are never connected | **Fixed** |
| B26 | Medium | `(pause:scene)` never resumes; `pauseall-<type>` / `resumeall-<type>` ignore the type | **Fixed** |
| B27 | Medium | Missing / mistyped audio file leaves a zombie track; `play` without a name requests `undefined` | **Fixed** |
| B28 | Medium | `sidechain` by file name (as documented) does not resolve | **Fixed** |
| B29 | Medium | Pump node orphaned when a track restarts; no-arg `disconnect()` cuts sidechain taps | **Fixed** |
| B30 | Low | Effects log a false `console.error` on every boot | **Fixed** |
| B31 | Medium | MV on Android Chrome: BGM tracks go through the shared `Html5Audio` element | **Fixed** |
| B32 | High | Returning from a battle is treated as a map change | **Fixed** |
| B33 | Low | Alias `cooldown` swallows the first play shortly after startup | **Fixed** |
| B34 | Low | Core parameters ignored when the Core is renamed or the bundle is used under its own name | **Fixed** |
| B35 | Medium | README's `FugsAudio.play({ type, trackId, name, … })` example played nothing | **Fixed** |
| B36 | Low | Dev test runner: `test.mode = "human"` did nothing; `test('preset:cave')`, `test('fade:curve:smooth')` and every listed `a:b` name ran the whole group | **Fixed** |
| B37 | Medium | `duck` / `duckall` / `duckall-sidechain` set tracks *to* the duck level, so muted or quiet tracks got louder | **Fixed** |

---

## Confirmed bugs

### B01 — Critical: Battle auto-pause never resumes — **FIXED 2026-08-09**

**Where:** `Scene_Battle.prototype.terminate`, `Scene_Menu.prototype.terminate`, `handleSceneTransition`

**What was wrong:** Default `pauseMode: battle` paused tracks on battle enter, but battle exit never resumed them.

**Fix:** Battle→map terminate now resumes `_pauseMode === "battle"` tracks (mirrors menu), then runs `handleSceneTransition("scene")`. *(Since B32 the battle→map hand-off uses its own `"afterBattle"` transition instead of `"scene"`.)*

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

---

## Compatibility audit (v2.3) — MZ and MV

Found with the engine harness (`scripts/harness`, scenarios in `scripts/tests`). Everything version-specific now lives in one place, `FugsAudio.engine` in the Core (`createBuffer`, `sourceNodes`, `setPlaybackRate`, `routeSources`, `release`, …), so the satellites stay engine-agnostic.

### MZ

#### B17 — Critical: MZ — nothing plays — **FIXED 2026-09-30**

**Where:** every `AudioManager.createBuffer(type, name)` call (`playAudio`, `syncPlay`, `resumeAudio`)

**What was wrong:** MZ's `createBuffer` takes the folder **with a trailing slash** (`"bgm/"`); MV takes `"bgm"`. On MZ the URL became `audio/bgmThemeA.ogg`, so every file failed to load.

**Fix:** `Engine.createBuffer(type, name)` picks the right folder form for the running engine.

**Covered by:** `01-boot-and-commands` (every audio type maps to its own folder, …)

---

#### B18 — Critical: MZ — effects never connect; every pitch change restarts the track — **FIXED 2026-09-30**

**Where:** `FugsAudio2Effects.js` (`validateBuffer`, `connectEffectChain`, `_disposeEffectChain`), `updateTrackPitch`

**What was wrong:** The plugin worked on `buffer._sourceNode`. MZ keeps `buffer._sourceNodes[]` (one node per decoded chunk), so effect chains found nothing to route. `updateTrackPitch` then fell back to the engine's `pitch` setter — which **restarts playback from 0** (MV and MZ) — so on MZ every pitch fade, doppler update and `pitchbend` step re-triggered the song.

**Fix:** `Engine.sourceNodes(buffer)` returns the live nodes on either engine; effects route/restore all of them. `Engine.setPlaybackRate(buffer, rate)` ramps `playbackRate` on every node, re-anchors the buffer's start time so `seek()` stays exact, and never touches the `pitch` setter.

**Covered by:** `02-playback` (pitch keeps position), `04-effects`, `05-spatial-and-dynamics`

---

#### B19 — Critical: MZ — no plugin commands exist — **FIXED 2026-09-30**

**Where:** `Game_Interpreter.prototype.pluginCommand` hook, plugin header

**What was wrong:** MZ only offers commands a plugin declares with `@command`; the pack declared none, and MZ's legacy path (`command356`) passes its parameters as an argument (there is no `this._params`), which broke the quoted-name re-parse for imported MV events.

**Fix:** Header declares `@command run` (one command) and `@command runMultiple` (one per line); both are registered under the file name the plugin was **actually loaded as** (users rename plugins) plus the default names. `command356` is wrapped so imported "Plugin Command (MV)" events keep their quoted names. New script call `FugsAudio.runCommandText(text)`.

**Covered by:** `01-boot-and-commands` (native `run`, quoted names, renamed plugin file, switch-gated, legacy MV events)

---

#### B20 — High: MZ — save restore runs before the save is loaded — **FIXED 2026-09-30**

**Where:** `DataManager.loadGame` hook

**What was wrong:** In MZ `loadGame` returns a **Promise**; the hook treated the return value as MV's boolean and restored audio on a fixed 100 ms timer — before the save contents had been extracted, so it could apply the wrong audio state or none.

**Fix:** When `loadGame` returns a Promise, the scene transition and `loadAllStates("auto")` run after it resolves; MV's synchronous path is unchanged.

**Covered by:** `03-scenes-and-saves` (slow disk, save/load restores the mix and position)

---

#### B21 — High: MZ web builds — progressive decode replaces the source nodes — **FIXED 2026-09-30**

**Where:** effect routing, `_scheduleTrackEndAction`

**What was wrong:** Served over http(s), MZ downloads a file in chunks and re-decodes the growing data, **re-creating the source nodes each time**. Effect-chain routing was silently lost with the first refresh, and an end-of-track timer computed from the first *partial* decode cut one-shots short.

**Fix:** `Engine.routeSources` hooks node creation so routing survives refreshes; the end timer re-arms itself while the buffer is still playing with time left.

**Covered by:** `07-deployment-variants` (MZ over http: chunked download + progressive decode, verified on the real MZ 1.7.0 scripts)

---

#### B22 — Medium: MZ — released buffers stay in memory — **FIXED 2026-09-30**

**Where:** `_releaseBuffer`

**What was wrong:** MV-style clean-up (nulling `_buffer`, `_sourceNode`) left MZ's decoded chunks (`_buffers[]`) and node array alive.

**Fix:** `Engine.release(buffer)` disconnects every node and, on MZ, calls the buffer's `destroy()`. The dev test runner's `cleanup()` uses it too.

**Covered by:** `02-playback` (stop releases the track), `08-dev-test-runner`

---

### MV (and MZ)

#### B23 — High: Tracks auto-paused for a battle vanish on return — **FIXED 2026-09-30**

**Where:** `cleanupOrphanedTracks`

**What was wrong:** The just-resumed buffer was reaped as "dead": on MV `isPlaying()` is false until the file has been decoded, and a resumed track is a fresh buffer.

**Fix:** A buffer that is still loading (`Engine.isLoading`) is never an orphan.

**Covered by:** `03-scenes-and-saves` (persistence × pause matrix)

---

#### B24 — High: `seek()` drifts after pitch changes; low-pitched one-shots are cut short — **FIXED 2026-09-30**

**Where:** `updateTrackPitch`, `_scheduleTrackEndAction`

**What was wrong:** A pitch change ramped the source node's `playbackRate` and overwrote the engine's `_pitch`, but did not re-anchor `_startTime`. `seek()` is `(now − _startTime) × _pitch`, so it jumped after every pitch change — pause/resume and save then resumed at the wrong spot — and the engine's own end timer, created for the old speed, cut slowed-down SE/ME off.

**Fix:** `Engine.setPlaybackRate` (see B18) keeps `_pitch`/`_startTime` consistent and re-arms the engine end timer; the plugin's own end action re-arms while time remains.

**Covered by:** `02-playback` (seek stays accurate after pitch changes)

---

#### B25 — High: Effects requested while the file is still loading are never connected — **FIXED 2026-09-30**

**Where:** `FugsAudio2Effects.js` `connectEffectChain` (+ new `hub._deferEffectConnect`)

**What was wrong:** `play … {effect:…}`, `effect-…` right after `play-…`, and effects re-applied after a resume all ran before the source node existed; the chain was silently skipped.

**Fix:** `validateBuffer` reports `pending` for a loading buffer and the chain is connected from the buffer's load listener.

**Covered by:** `04-effects` (an effect issued right after play is applied as soon as the track starts)

---

#### B26 — Medium: `(pause:scene)` never resumes; typed `pauseall`/`resumeall` ignore the type — **FIXED 2026-09-30**

**Where:** `handleSceneTransition`, `pauseAll`, `resumeAll`

**What was wrong:** Tracks paused by `(pause:scene)` had no resume trigger. `pauseall-bgm` / `resumeall-bgm` (documented as `pauseall-[Type]`) hit every type.

**Fix:** Scene-paused tracks are remembered (`_scenePausedKeys`) and resumed when the next `Scene_Map` is created — tracks you paused by hand are not. The type argument is honoured.

**Covered by:** `03-scenes-and-saves`, `02-playback` (pauseall-bgm / resumeall-bgm only touch BGM)

---

#### B27 — Medium: Missing / mistyped audio file leaves a zombie track — **FIXED 2026-09-30**

**Where:** `playAudio`, `resumeAudio` (new `_watchLoad`), `cleanupOrphanedTracks`

**What was wrong:** A typo'd name kept a track that never played and was polled forever; `play-bgm1` with no file name asked the engine for `audio/bgm/undefined`.

**Fix:** Empty names are rejected with a warning. A load that fails, or takes longer than 30 s (`LOAD_TIMEOUT_MS`; 120 s, `LOAD_TIMEOUT_WEB_MS`, when the game is served over http(s), so a big file on a slow connection is not mistaken for a missing one), is reported as `Could not load audio/<type>/<name>` and the track is cleaned up.

**Covered by:** `02-playback` (a missing audio file does not leave a zombie track or a busy timer loop), `07-deployment-variants` (slow downloads over http)

---

#### B28 — Medium: `sidechain` by file name does not resolve — **FIXED 2026-09-30**

**Where:** `FugsAudio4Dynamics.js` `setupSidechain` / `stopSidechain`

**What was wrong:** The docs example `sidechain-bgm kick bass …` names tracks by file, but only numeric ids were understood.

**Fix:** `hub._resolveBgmTrackId(ref)` accepts a track number or a (case-insensitive) file name.

**Covered by:** `05-spatial-and-dynamics`

---

#### B29 — Medium: Pump node orphaned on track restart; no-arg `disconnect()` cuts sidechain taps — **FIXED 2026-09-30**

**Where:** `FugsAudio4Dynamics.js` `ensurePumpNode`

**What was wrong:** When a looping track was re-created, the pump stayed wired into the old nodes; and `gainNode.disconnect()` with no argument could also sever the sidechain analyser taps (listed under "Risky" earlier).

**Fix:** The pump re-wires whenever the track's gain/panner nodes changed, keeps its level, and disconnects only its own edge (`disconnect(_pannerNode)`).

**Covered by:** `05-spatial-and-dynamics` (the pump keeps working after a track restarts)

---

#### B30 — Low: Effects log a false `console.error` on every boot — **FIXED 2026-09-30**

**Where:** `AudioEffects.init()`

**What was wrong:** The engine creates its audio context *after* plugins load, so "no context yet" is normal at that point, but it was logged as an error.

**Fix:** Logged at debug level; the context is picked up when it exists.

**Covered by:** `01-boot-and-commands` (no console errors at load; Effects picks up the context created after plugin load)

---

#### B31 — Medium: MV on Android Chrome — BGM goes through the shared `Html5Audio` element — **FIXED 2026-09-30**

**Where:** `Engine.createBuffer`

**What was wrong:** MV plays BGM through one shared `<audio>` element on Android Chrome. It cannot host several independent tracks, and it hijacked the game's own BGM.

**Fix:** For BGM in that situation the pack builds a regular WebAudio buffer itself.

**Covered by:** `07-deployment-variants`

---

#### B32 — High: Returning from a battle is treated as a map change — **FIXED 2026-09-30**

**Where:** `Scene_Battle.prototype.terminate`, `handleSceneTransition`

**What was wrong:** The battle → map hand-off ran the normal "scene" clean-up, so `(p:battle)` ("survives battle") tracks and tracks paused for the battle were stopped and forgotten afterwards — contradicting the Docs behaviour table.

**Fix:** New `"afterBattle"` transition: tracks that Pause or Continue in the table stay; tracks just resumed from a battle pause are protected from `none` persistence; `(p:none)` tracks started **during** the battle still end with it.

**Behaviour change:** after a battle those tracks are no longer stopped. Use `(p:none)` if you relied on the old cut.

**Covered by:** `03-scenes-and-saves` (the persistence × pause matrix and the `(p:none)` started-in-battle case)

---

#### B33 — Low: Alias `cooldown` swallows the first play shortly after startup — **FIXED 2026-09-30**

**Where:** `FugsAudio6Aliases.js` `playAlias`

**What was wrong:** The check `now - lastPlayed < cooldown` used `0` for "never played", so within the first `cooldown` milliseconds of `performance.now()` the very first play counted as a repeat.

**Fix:** A missing timestamp means "not on cooldown".

**Covered by:** `06-switch-aliases-compat` (cooldown suppresses rapid repeats)

---

#### B34 — Low: Core parameters ignored when the Core is renamed or the bundle is used under its own name — **FIXED 2026-09-30**

**Where:** parameter loading at the top of `FugsMultiTrackAudioEX.js`

**What was wrong:** Parameters were only read under the names `FugsAudio1Core` and `FugsMultiTrackAudioEX`. Plugin Manager stores them under the file's real name, so a renamed Core — or `dist/FugsMultiTrackAudioEX.bundle.js` enabled as it is — silently ran with the defaults, whatever was set in the dialog. (MZ plugin commands were already registered under the real name, see B19.)

**Fix:** The Core remembers the file name it was loaded as and reads that first, then the two default names.

**Covered by:** `01-boot-and-commands` (plugin parameters)

---

#### B35 — Medium: README's `FugsAudio.play({ type, trackId, name, … })` example played nothing — **FIXED 2026-09-30**

**Where:** `FugsAudio.play` (script API), README "Quick start"

**What was wrong:** The README's Script API block called `play` with ONE object. `play` only understood the positional form the Docs plugin documents (`play(type, trackId, name, options)`), took the object for the *type*, and logged `play-[object Object]1: no audio file name given` — nothing played, on both engines.

**Fix:** `play` also accepts the single-object form; the positional form is unchanged.

**Covered by:** `09-readme-quickstart` — every README quick-start example now runs verbatim on every backend and is checked on the audio graph.

---

#### B36 — Low: Dev test runner — `test.mode` inert, `test('name:param')` runs the whole group — **FIXED 2026-09-30**

**Where:** `FugsAudio8Test.js` (`window.test`, `TestRunner.run`)

**What was wrong:** (a) README/Docs say `test.mode = "human"`; `window.test` is a function and the runner reads `TestRunner.mode`, so the assignment silently did nothing. (b) Any pattern with a colon was split into *group + parameters*: `test('preset:cave')` ("single preset", per the runner's own help) ran **all** `preset:*` tests (500+ checks), `test('fade:curve:smooth')` ran every `fade:*` test, and `test('unit:parse')` — a name copied from `test('?')` — ran every unit test.

**Fix:** `test.mode` is an accessor for `TestRunner.mode`. With a colon, the registered test named by the longest prefix runs, and the rest are its parameters (`preset` + `cave`, `fade:curve` + `smooth`, `unit:parse` alone). A bare group name (`test('play')`) still runs the group.

**Covered by:** `08-dev-test-runner`

---

#### B37 — Medium: Ducking raises muted and quiet tracks — **FIXED 2026-10-01**

**Where:** `FugsAudio4Dynamics.js` `duckVolume` (used by `duck`, `duckall`, `duckall-[Type]`, `duckall-sidechain`, `FugsAudio.duck` / `duckAll`)

**What was wrong:** Every track faded *to* `duckLevel` instead of *by* it. With `duckall 0.25 …`, a stem waiting at 0% jumped up to 25% (and a 20% ambience got louder) for the length of the duck. Found while building the demo game.

**Fix:** The duck target is `duckLevel` × the track's current level (or its fade target, if a fade is running): 0.3 on a 90% track gives 27%, and a muted track stays muted. The restore is unchanged.

**Covered by:** `05-spatial-and-dynamics` (ducking is relative: a muted track stays silent and a quiet one gets quieter)

---

### Documentation corrected (in `FugsAudio0Docs.js`)

MZ quick-start and the `Run Command` note; a `{config}` is typed on one line (MZ's multi-line command box also accepts one that wraps — `runCommandText` joins it); the `(loop:N)` / `(curve:name)` tags; the `madness` preset; sidechain arguments by number or file name; proximity updates every frame; transitions do not use snapshots; pause and battle-return semantics; the Options-menu volume note; the missing-file console message.

### Still open (engine-level, by design or out of scope)

- Fugs tracks ignore the **Options-menu BGM/BGS/ME/SE sliders** (documented; the engine's master volume still applies).
- No `Scene_Gameover` hook (see the table below).
- MZ web builds: resuming a paused track creates a new buffer, which fetches the file again.

## Risky / unconfirmed

These look wrong or fragile but need runtime confirmation or sharper repros before promoting to confirmed bugs.

| Area | Notes | Approx. lines |
|------|-------|---------------|
| `syncPlay` / `startSyncedBuffers` | Schedules a future context time but never uses it; starts are only “close enough” (admitted in comments). | sync helpers |
| ~~`ensurePumpNode` + sidechain~~ | ~~`gainNode.disconnect()` with no args can sever analyzer taps.~~ Confirmed and fixed — see B29. | pump / sidechain |
| `loadGame` ordering | `handleSceneTransition` then 100ms `loadAllStates("auto")` can race with prior fadeouts / context readiness. | ~7914–7922 |
| `stopAllOfType` / `fadeAllOfType` | `key.startsWith(type)` is coarse (fine for `bgm`/`bgs`/`se`/`me` today). | ~5005+ |
| Switch OFF | Only auto-stops `play` actions; fade/duck/effect switch commands don’t reverse except via duck restore. | SwitchBuffer |
| ~~`pluginCommand` quote re-parse~~ | ~~Only a subset of prefixes get full-string re-parse…~~ Not reproduced: the hook re-parses every registered command. Quoted names now verified on MV and on MZ (native command and imported MV events). | plugin commands |
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
| 2026-09-30 | Compatibility audit for RPG Maker MV 1.6 and MZ 1.x: engine harness + ~170 scenarios per backend, real MZ 1.7.0 scripts, Chromium 65 syntax/API scan → B17–B36 |

---

## Fix priority (suggested)

1. ~~**B01**~~ **fixed** — battle resume.
2. ~~**B02**~~ **fixed** — plugin-command `loop`.
3. ~~**B03 / B04 / B16 / B15**~~ **fixed** — pause/resume cluster.
4. **B05 / B14** — Proximity update cluster (every-frame / realXY dirty flag).
5. **B06 / B12** — Save/load fidelity.
6. **B07 / B11** — Sidechain correctness + leak.
7. **B08–B10, B13** — Fade/cleanup races and bulk-command consistency.
