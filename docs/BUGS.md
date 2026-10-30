# FugsMultiTrackAudioEX — Known Bugs

**Source:** Core `FugsMultiTrackAudioEX.js` + satellites `FugsAudio2Effects` / `FugsAudio3Spatial` / `FugsAudio4Dynamics` / `FugsAudio5Switch` / `FugsAudio6Aliases`  
**Last updated:** 2026-10-30  
**Status legend:** Open · Fixed · Confirmed in code · Fix not applied

This file tracks confirmed defects found by code review. Severity reflects user impact under default or common setups.

> **Status (2026-10-30):** B01–B46 are fixed (spot-checked in source; scripts/assert-bugs.js locks B17–B46 fix claims and N01–N35 dismissals). No open bugs remain in this ledger. Items checked and dismissed live in Not a bug (N01–N35) — do not re-open them as bugs without new evidence.

> **Compatibility audit (v2.3, 2026-09-30):** Checked against MV 1.6, MZ 1.x, and real MZ 1.7.0 scripts. The audit found 20 further defects and fixed them with scenario coverage in scripts/tests/ and README Verification. Its original B17–B36 labels overlap different entries in the ledger below; this file keeps the existing B01–B46 numbering.


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
| B13 | Medium | Per-type “all” commands hit paused tracks; global “all” skips them | **Fixed** (hole remains: B32) |
| B14 | Medium | Proximity gated on tile coords, not smooth movement | **Fixed** |
| B15 | Low–Medium | Manual resume doesn’t refresh proximity volume | **Fixed** |
| B16 | Low | Pause-with-fadeout blocks resume until timeout | **Fixed** |
| B17 | High | Load game leaves leftover session tracks playing | **Fixed** |
| B18 | High | `pauseMode: scene` never auto-resumes | **Fixed** |
| B19 | High | `pauseMode: menu` resumes in Item/Skill/Equip/Save | **Fixed** |
| B20 | Medium | No `Scene_Gameover` hook — tracks keep playing | **Fixed** |
| B21 | Medium | Switch-gated commands are not in save data | **Fixed** |
| B22 | Medium | Runtime SFX aliases are not in save data | **Fixed** |
| B23 | Medium | `ensurePumpNode` severs sidechain analyser taps | **Fixed** |
| B24 | Medium | Switch OFF only auto-stops `play` actions | **Fixed** |
| B25 | High | New Game / title does not reset mixer + satellite runtime | **Fixed** |
| B26 | Medium–High | Effect chain not connected on cold/unready buffers | **Fixed** |
| B27 | Medium | Sidechain writes `_gainNode.gain` and fights volume/proximity/fades | **Fixed** |
| B28 | Low | `syncPlay` computes a start time and never uses it | **Fixed** |
| B29 | Low | Dashless `syncplay` parses as type `all` | **Fixed** |
| B30 | Low | Ready buffer with `_totalTime === 0` retries end-timer forever | **Fixed** |
| B31 | Medium | Event-bound proximity is not map-local | **Fixed** |
| B32 | Medium | `duckall-sidechain` still hits paused tracks (B13 hole) | **Fixed** |
| B33 | Low–Medium | Pause cancels pending duck-hold restore | **Fixed** |
| B34 | High | Save/pause capture post-proximity `buffer.volume` (double attenuation) | **Fixed** |
| B35 | Medium | `cancelFade` drops `onComplete` — duck/fade sequencing dies | **Fixed** |
| B36 | Medium | Fade-in + proximity on a cold buffer skips the silent start | **Fixed** |
| B37 | Medium | Global dry path bypasses insert effects (filters/distortion) | **Fixed** |
| B38 | Medium | Pause/stop clears *all* per-key timeouts (chain, crossfade, effects) | **Fixed** |
| B39 | Low | Delay times > 1s throw (`DelayNode` maxDelay default 1) | **Fixed** |
| B40 | Medium | Positional fade curve is dead; `(curve:)` dropped on fadeall | **Fixed** |
| B41 | Low | Alias cooldown is consumed even if `playAudio` fails | **Fixed** |
| B42 | Medium | `duckpump` only ticks on `Scene_Map` (freezes in menu/battle) | **Fixed** |
| B43 | Low | First `playAlias` is blocked while `cooldown > performance.now()` | **Fixed** |
| B45 | Medium | Cold paused restore snapshots proximity volume (B12+B34) | **Fixed** |
| B46 | Medium | `syncPlay` ignores `(p:)` / `(pause:)` from the command | **Fixed** |

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

**Residual:** `parseClassicSyntax` still never extracts an effect tag, so `parsed.effect` is always `undefined` on the plugin-command path. Play-time effects only work via `FugsAudio.play(..., { effect })` (and that path hits B26 on a cold buffer). Not advertised in the playbook command grammar.

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

**Hole:** `sidechainDuck` / `duckall-sidechain` was not updated — see B32.

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

### B17 — High: Load game leaves leftover session tracks playing — **Fixed 2026-10-30**

**Where:** `DataManager.loadGame`, `handleSceneTransition`, `loadAllStates`

**What is wrong:** After `applySaveData`, load runs `handleSceneTransition("scene")` then, 100ms later, `loadAllStates("auto")`. Default persistence `scene` does **not** stop on a scene transition, and `loadAllStates` never stops keys that are absent from the snapshot.

**Triggers:** In-game Load: save with `bgm_1`, later start `bgs_1` rain, load the save → Town BGM restores and rain keeps playing.

Same-key title/session tracks are usually replaced (`playAudio` → `stopAudio(0)` with buffer-identity checks on pending fade-stops). Leftovers are keys **not** in the snapshot.

**Fix:** Before restore, stop (or fade-stop) every live track whose key is not in the snapshot — or `stopAll(0)` then `loadAllStates`. Do not rely on `handleSceneTransition("scene")` to wipe the current session.

---

### B18 — High: `pauseMode: scene` never auto-resumes — **Fixed 2026-10-30**

**Where:** `handleSceneTransition`, `Scene_Map.prototype.terminate` — missing resume on `Scene_Map.create` / `start`

**What is wrong:** Same class of bug as B01. Map→map transfer calls `handleSceneTransition("scene")`, which pauses `_pauseMode === "scene"` tracks. Nothing resumes them. Battle→map also uses `"scene"` after the battle-resume pass, so a `(pause:scene)` track that survived battle is paused forever.

Battle and menu have explicit resume paths; scene does not.

**Triggers:** Plugin Manager Default Pause Mode = Scene (factory default is **battle**), or `(pause:scene)` on a command. Transfer maps (or return from battle). Track stays silent until a manual `resume-*`.

**Fix:** On `Scene_Map.start` (or after a `"scene"` transition completes), resume tracks whose `_pauseMode === "scene"`, mirroring battle/menu.

---

### B19 — High: `pauseMode: menu` resumes in Item/Skill/Equip/Save — **Fixed 2026-10-30**

**Where:** `Scene_Menu.prototype.start` / `terminate` only (not `Scene_MenuBase`)

**What is wrong:** Pause is tied to `Scene_Menu`. Opening Items uses `SceneManager.push(Scene_Item)`, which **terminates** the menu scene and therefore resumes menu-paused tracks. Same for Skill, Equip, Status, Options, Save, Load, Game End.

Shop / Name from an **event** never touch `Scene_Menu`, so `(pause:menu)` does not pause at all there. `handleSceneTransition("menu")` exists but is never called (see N07).

**Triggers:** Default Pause Mode = Menu (factory default is **battle**), or `(pause:menu)`. Open menu (music pauses) → Items (music comes back). Or talk to a shop while menu-pause is on.

**Fix:** Hook `Scene_MenuBase` start/terminate (or pause while any menu-family scene is in the stack), not only `Scene_Menu`. Include Shop/Name.

---

### B20 — Medium: No `Scene_Gameover` hook — tracks keep playing — **Fixed 2026-10-30**

**Where:** Scene hooks in core (Title is hooked; Gameover is not). `Scene_Map.terminate` / `Scene_Battle.terminate` also ignore Gameover as a next scene.

**What is wrong:** `Scene_Title.start` calls `stopAll`. Game Over does not. Map/battle Fugs tracks keep running over the game-over screen (and MV’s own game-over ME). Going Map/Battle → Gameover is neither `Scene_Battle` nor `Scene_Map`, so `handleSceneTransition` never runs.

**Triggers:** Party wipe with Fugs BGM/BGS still up.

**Fix:** `Scene_Gameover.start` (or terminate of the previous scene when next is Gameover) should `stopAll` or `handleSceneTransition("scene")` plus a hard stop of `always` tracks.

---

### B21 — Medium: Switch-gated commands are not in save data — **Fixed 2026-10-30**

**Where:** `FugsAudio5Switch.js` `SwitchBuffer` / `SwitchManager`; `getSaveData` / `applySaveData`

**What is wrong:** `commandBuffer`, `activeCommands`, `restoreCommands`, and `monitoredSwitches` are in-memory only. `$gameSwitches` is replaced wholesale on load (`extractSaveContents` does not call `setValue`), so the switch hook never re-fires.

**Triggers:** `play-bgm1 Theme switch:15` → save → load. Track may restore via B06 audio snapshot, but turning switch 15 OFF does nothing until an event re-registers the command. Parallel/autorun events that re-run will recover; one-shot / already-completed events will not.

**Fix:** Serialize SwitchBuffer into `__fugsMeta` (or a reserved snapshot), restore it in `applySaveData`, and re-bind `monitoredSwitches`. Optionally re-evaluate ON switches after restore.

---

### B22 — Medium: Runtime SFX aliases are not in save data — **Fixed 2026-10-30**

**Where:** `FugsAudio6Aliases.js` `sfxAliases` / `aliasLastPlayed`; save hooks

**What is wrong:** `registeralias` pools live only in a runtime Map. Load does not restore them. `play-se alias:Footstep` fails (or plays nothing) after Continue until the register command runs again.

**Triggers:** Register aliases in a boot common event that does not re-run on load.

**Fix:** Persist alias configs (not cooldowns) in `__fugsMeta`.

---

### B23 — Medium: `ensurePumpNode` severs sidechain analyser taps — **Fixed 2026-10-30**

**Where:** `FugsAudio4Dynamics.js` `ensurePumpNode`

**What is wrong:** `buffer._gainNode.disconnect()` with no destination disconnects **every** output of the gain node, including `gain → analyser` taps created by `setupSidechain`. Pump then reconnects `gain → pump → panner` only. The envelope follower reads silence; ducking stops. Combining `duckpump` + `sidechain` is broken.

**Triggers:** Sidechain two BGM tracks, then `duckpump`.

**Fix:** Disconnect only the gain→panner (or gain→destination) edge, or insert the pump node without a blanket `disconnect()`. Reconnect any live analyser taps.

---

### B24 — Medium: Switch OFF only auto-stops `play` actions — **Fixed 2026-10-30**

**Where:** `FugsAudio5Switch.js` `stopSwitchCommands`

**What is wrong:** Only `command.action === "play"` is reversed (hard `stopAudio`). Fade / effect / proximity / pitch / pansweep stay applied. Duck is the exception (restore commands). Turning the switch off does not undo the rest.

**Triggers:** `fade-bgm1 30 1 switch:5` or `effect-bgm1 cave switch:5`, then switch 5 OFF. Volume/effect remain.

**Fix:** Per-action reverse (restore pre-command mixer/effect/spatial), or document as play-only gating and reject other actions with `switch:`.

---

### B25 — High: New Game / title does not reset mixer + satellite runtime — **Fixed 2026-10-30**

**Where:** `DataManager.setupNewGame`, `Scene_Title.prototype.start`

**What is wrong:**

- `setupNewGame` only calls `handleSceneTransition("scene")`. Default persistence `scene` does **not** stop those tracks. New Game from Game End (never visiting Title) keeps the previous playthrough’s BGM.
- `Scene_Title.start` `stopAll` helps only if Title actually starts, and it does not clear `SwitchBuffer`, `sfxAliases`, `namedSnapshots`, or `pumpConfig`.
- Previous session switch commands and aliases remain armed in the same process.

**Triggers:** Menu → Game End → New Game with Fugs BGM playing. Or Title → New Game after `registeralias` / switch-gated commands in the last playthrough.

**Fix:** A dedicated `resetRuntime({ stop: true })` on New Game and Title: `stopAll(0)`, clear snapshots / paused maps / SwitchBuffer / aliases / pump / sidechains / proximity.

---

### B26 — Medium–High: Effect chain not connected on cold/unready buffers — **Fixed 2026-10-30**

**Where:** `playAudio` (core), `applyEffect` / `connectEffectChain` (`FugsAudio2Effects.js`), `resumeAudio` recreate path, `loadTrackState`

**What is wrong:** MV `buffer.play()` defers `_sourceNode` creation until the buffer is ready. `applyEffect` still builds a chain and returns `true` even when `connectEffectChain` fails (`Missing _sourceNode` — return value ignored). When load later completes, MV connects `source → gain` and **bypasses** the orphaned chain. The effect name is stored (`buffer._effect`) so list/save look correct, but nothing is audible.

Same race on resume-recreate and on save/load restore of a track that had an effect.

**Cold cache only:** If `isReady()` is already true, `play()` creates `_sourceNode` immediately and connect succeeds. Warm-cache loads/plays are fine.

**Triggers:** First play of a file (cold cache) with `FugsAudio.play('bgm', 1, 'Theme', { effect: 'cave' })`, or load a save whose tracks had effects before the file is decoded, or `effect-bgm1 cave` issued in the same frame as `play` before decode finishes.

**Fix:** If `connectEffectChain` fails because the source is missing, `addLoadListener` and retry. `applyEffect` should not report success until connected (or explicitly queued).

---

### B27 — Medium: Sidechain writes `_gainNode.gain` and fights volume/proximity/fades — **Fixed 2026-10-30**

**Where:** `FugsAudio4Dynamics.js` `processEnvelope` (`_gainNode.gain.setValueAtTime`), vs core `fadeAudio` / Spatial `updateProximityVolume` setting `buffer.volume`

**What is wrong:** MV’s `volume` setter writes the same AudioParam. Sidechain multiplies `currentGain * targetTrack.volume` onto `_gainNode.gain` every RAF. Fades and proximity also write `buffer.volume` (which writes the param). The two clocks fight; ducking is zippery and proximity/fades on a sidechain **target** are unreliable.

**Triggers:** `sidechain` onto a track that also has proximity or an active volume fade.

**Fix:** Drive ducking through a dedicated gain node in series (like pump), not the MV volume param. Or apply sidechain as a multiplier on `_manualVolume` and let one writer own `_gainNode.gain`.

---

### B28 — Low: `syncPlay` computes a start time and never uses it — **Fixed 2026-10-30**

**Where:** `syncPlay` / `startSyncedBuffers`

**What is wrong:** `startTime = WebAudio._context.currentTime + 0.05` is logged, then each buffer is started with `buffer.play(true, 0)`. Comments admit RPG Maker doesn’t expose `_sourceNode.start(when)`, so stems are only “close enough”. Looping stems still drift if lengths differ (documented). 

**Triggers:** `syncplay-bgm Drums Bass Pads Lead` on a cold cache (decode finish order differs).

**Fix:** Wait for all stems. On MV, schedule a fresh source node at the common start time; a Web Audio source cannot be started twice. MZ uses its engine playback path.

---

### B29 — Low: Dashless `syncplay` parses as type `all` — **Fixed 2026-10-30**

**Where:** `parseClassicSyntax` dashless branch, `syncPlay`

**What is wrong:** `syncplay Drums Bass` (no `-bgm`) sets `type: "all"`, keys `all_1`, and `AudioManager.createBuffer("all", name)` looks in a non-existent `audio/all/` folder.

**Triggers:** Forgetting `-bgm` / `-bgs` on `syncplay`.

**Fix:** Default dashless `syncplay` to `bgm`, or reject type `all` in `syncPlay`.

---

### B30 — Low: Ready buffer with `_totalTime === 0` retries end-timer forever — **Fixed 2026-10-30**

**Where:** `_scheduleTrackEndAction`

**What is wrong:** If `schedule()` runs while `_totalTime <= 0`, it `setTimeout(schedule, 200)` with **no cap**. That loop only starts after `isReady()` is true or a load listener has fired. A missing file that never becomes ready does **not** enter this loop (it waits on `addLoadListener` instead — a stuck track, but not a 200ms timer). 

**Triggers:** One-shot / repeat track whose WebAudio buffer reports ready with duration `0` (empty/corrupt decode, stub, or getter returning 0). Not a typical 404.

**Fix:** Cap retries (e.g. 50 × 200ms) then `cleanupTrack`. Treat `_totalTime <= 0` after ready as an error.

---

### B31 — Medium: Event-bound proximity is not map-local — **Fixed 2026-10-30**

**Where:** `FugsAudio3Spatial.js` `proximityData`; `Scene_Map.prototype.create` (clears error log only)

**What is wrong:** Default persistence `scene` keeps tracks (and their `proximityData`) across map transfers. `{event:5}` stays bound. On the new map, event 5 is a different event — or missing (one warn, then silent). Volume/pan follow the wrong source.

**Triggers:** `proximity-bgm1 {event:5, maxDistance:8}` on Map 1, transfer to Map 2 with the same BGM still playing.

**Fix:** Clear or re-validate event-bound proximity on map create; or store `mapId` and disable the binding when the map changes.

---

### B32 — Medium: `duckall-sidechain` still hits paused tracks (B13 hole) — **Fixed 2026-10-30**

**Where:** `FugsAudio4Dynamics.js` `sidechainDuck`

**What is wrong:** B13 added `pausedTracks` skips to `fadeAllOfType`, `duckAllOfType`, `duckAllAudio`, `pitchBendAll*`. `sidechainDuck` (used by `duckall-sidechain`) was missed. Duck applies to the stopped buffer; resume restores the snapshot (duck appears to do nothing, or worse, fights B33).

**Triggers:** Battle auto-pause → `duckall-sidechain bgm1 0.3 1 2` → resume.

**Fix:** Same `pausedTracks` continue-guard as `duckAllAudio`.

---

### B33 — Low–Medium: Pause cancels pending duck-hold restore — **Fixed 2026-10-30**

**Where:** `pauseAudio` (cancels `activeTimeouts` for the key), `duckVolume` timed hold (`setTimeout` restore, tracked in `activeTimeouts`)

**What is wrong:** A timed duck schedules a restore timeout on the track key. Pause (including battle auto-pause) clears that key’s timeouts, so the restore never runs. Snapshot is taken at the ducked volume; resume stays ducked.

**Triggers:** `duck-bgm1 0.3 1 4` then enter battle before hold ends.

**Fix:** Don’t cancel duck-restore timeouts on pause; or snapshot the *pre-duck* restore volume and apply it on resume / after battle. See also B35 / B38.

---

### B34 — High: Save/pause capture post-proximity `buffer.volume` (double attenuation) — **Fixed 2026-10-30**

**Where:** `captureTrackState` (playing branch uses `buffer.volume` / `buffer.pan`), `pauseAudio` snapshot (`volume: buffer.volume`, `pan: buffer.pan`)

**What is wrong:** Proximity writes the *output* loudness to `buffer.volume` and keeps the user level in `_manualVolume`. Save and pause both snapshot `buffer.volume`. Restore/resume then set `_manualVolume` from that already-scaled value and run proximity again → **double falloff**.

Same for pan if `enablePan` was on: saved pan is the spatial pan, then restore treats it as mixer pan (until the next proximity frame overwrites it).

Pitch is fine (`_basePitch`, not doppler).

**Triggers:** `proximity-bgm1 {x:10, y:12, maxDistance:6}` at volume 90. Walk far away (hear ~minVolume). Save → load, or pause → resume. Track is now quiet even when standing on the source. Save next to the source hides the bug. Requires Spatial proximity (not factory-default mixer-only use).

**Fix:** Persist `_manualVolume` (or `_originalVolume`) and mixer pan (`buffer._manualPan` or pre-proximity pan), not `buffer.volume` / `buffer.pan`. Keep capturing `_basePitch` as today.

---

### B35 — Medium: `cancelFade` drops `onComplete` — duck/fade sequencing dies — **Fixed 2026-10-30**

**Where:** `FadeManager.startFade` (cancels existing fade on the same key), `FadeManager.cancelFade`, `duckVolume` (schedules restore in the fade `onComplete`)

**What is wrong:** Starting a new volume fade on a key **deletes** the in-flight fade without calling `onComplete`. Timed duck uses that callback to start the hold timer and restore. A `fade-*` (or another duck, or pause cancelling fades) during the duck-in leaves the track stuck at the ducked (or mid-duck) level with no restore.

**Triggers:** `duck-bgm1 0.3 1 4` then `fade-bgm1 80 1` before the duck-in finishes.

**Fix:** `cancelFade(key, { complete: true | false })`. Duck should treat cancel as “don’t restore from this attempt” only when a newer duck owns the key; a user fade should adopt the user target and cancel the pending restore.

---

### B36 — Medium: Fade-in + proximity on a cold buffer skips the silent start — **Fixed 2026-10-30**

**Where:** `playAudio` (`volume = 0` when `fadein > 0`, but `_manualVolume` is the full target; fade waits on `addLoadListener`)

**What is wrong:** Until the buffer is ready, there is no `${key}_volume` fade, so Spatial `updateProximityVolume` runs and sets `buffer.volume` from full `_manualVolume * distance`. When load completes, `fadeAudio` starts from **that** current volume, not 0. Fade-in is not from silence; on a nearby source it can start near full volume.

**Triggers:** `play-bgm1 Theme 90 2` with proximity already configured, file not in cache.

**Fix:** Keep a volume fade registered (or a “fade pending” flag proximity already checks) for the whole load wait; or set `_manualVolume` to 0 until fade-in starts; or skip proximity while `fadein` is pending.

---

### B37 — Medium: Global dry path bypasses insert effects — **Fixed 2026-10-30**

**Where:** `FugsAudio2Effects.js` `createEffectChain` tail: `chain.input.connect(chain.dryGain)` always, then series nodes only feed `wetGain`. `applyEffect` uses the first effect’s `wet` (or default **0.35**) as the **chain-wide** mix.

**What is wrong:** Reverb/delay *should* sit in parallel with dry. Lowpass, highpass, distortion, compressor, bitcrusher, tremolo, autopan are **inserts** — dry bypasses them. Default mix 0.35 (equal-power ≈ 0.59 wet / 0.81 dry) means an `effect-bgm1 lowpass` or the `underwater` lowpass is mostly inaudible; ~30–80% of the signal is unfiltered.

Per-effect `wet:` on a reverb in a preset only sets the *global* mix (`effects.find(e => e.wet)`), not that node’s send.

**Triggers:** `effect-bgm1 underwater` or `effect-bgm1 lowpass`. Compare with dry bypass muted — the filter/distortion suddenly appears.

**Fix:** Split send vs insert: inserts 100% in series on the main path; only reverb/delay/chorus/multitap tap a wet bus. Or default insert presets to `wetMix: 1`.

---

### B38 — Medium: Pause/stop clears *all* per-key timeouts — **Fixed 2026-10-30**

**Where:** `pauseAudio`, `stopAudio`, `cleanupTrack` (`activeTimeouts` for that key)

**What is wrong:** One bucket holds duck-hold restore (B33), `chain` steps, crossfade delayed `stop` of the old track, and effect-crossfade midpoint apply. `pauseAudio` (and `cleanupTrack`) `clearTimeout`s the whole list. `stopAudio` doing the same is mostly correct (the track is going away); **pause** is the surprising case.

- `chain-bgm1 fade 50 2; wait 3; fade 90 2` — battle pause during `wait` aborts the rest forever.
- Crossfade: pausing the outgoing track cancels its delayed stop → both tracks can survive.
- Effect crossfade: midpoint apply is cancelled (B10 gen does not resurrect it).

**Triggers:** `chain-*` then enter battle (default `pauseMode: battle`). Or pause during a crossfade.

**Fix:** Tag timeouts by role (`chain`, `duckRestore`, `crossfadeStop`, `effectXfade`, `pauseStop`) and only cancel the roles that must die with pause. Resume should not be required to rebuild chains unless documented.

---

### B39 — Low: Delay times > 1s throw — **Fixed 2026-10-30**

**Where:** `createEffectChain` `case "delay"`: `createDelay(effect.maxDelay || AUDIO_CONSTANTS.DEFAULT_DELAY_MAX)` (`1`), then `delayTime.value = effect.delay || 0.3`

**What is wrong:** Web Audio throws `IndexSizeError` if `delayTime > maxDelay`. Plugin command `effect-bgm1 delay 2` maps args to `delay=2` and cannot pass `maxDelay`. `createEffectChain`’s try/catch returns `null` — the whole effect apply fails.

**Triggers:** `effect-bgm1 delay 2 0.4 0.5` (2s delay, 0.4 feedback, 0.5 wet).

**Fix:** `createDelay(Math.max(maxDelay, delayTime, 1))` before setting `delayTime`.

---

### B40 — Medium: Positional fade curve is dead; `(curve:)` dropped on fadeall — **Fixed 2026-10-30**

**Where:** `checkCurve` (always defaults to `"smooth"`), `executeCommand` `fade` / `pitch` / `pan` (`parsedCurve || args[n]`), `fadeAllOfType` / `fadeAllAudio` (never read `commandObject.curve`)

**What is wrong:** `checkCurve` returns `"smooth"` when no `(curve:…)` tag is present. That value is truthy, so `parsedCurve || args[4]` never reaches a positional curve name. The playbook still documents `fade-… [volume] [duration] [pan]? [pitch]? [curve]?`.

Worse: `fade-bgm1 50 2 linear` treats `"linear"` as **pan** (`toNum("linear")` → `0`), so a pan that was not 0 gets recentered.

`crossfade` is fine — it inspects `rest[0]` against the curve name list and does not use `parsedCurve` for that.

`fadeall-bgm 50 2 (curve:linear)` parses the tag into `commandObject.curve`, then `fadeAllOfType(args)` ignores it and fades with the `fadeAudio` default.

**Triggers:** `fade-bgm1 50 2 linear` or `pitch-bgm1 80 2 ease-in`. `(curve:linear)` on a single-track `fade-*` works. Tests only cover the paren form.

**Fix:** `checkCurve` should leave `curve` undefined when the tag is absent. Pass `command.curve` into fadeall. Keep positional detection like crossfade if the playbook keeps `[curve]?`.

---

### B41 — Low: Alias cooldown is consumed even if `playAudio` fails — **Fixed 2026-10-30**

**Where:** `FugsAudio6Aliases.js` `playAlias`

**What is wrong:** `aliasLastPlayed` is set **before** `playAudio`. If buffer creation fails (bad name, missing type, etc.), the alias still sits on cooldown and later plays are dropped.

**Triggers:** `play-se alias:Footstep` with a pool entry that `createBuffer` cannot load, then retry within `cooldown`.

**Fix:** Set `aliasLastPlayed` only after `playAudio` returns true.

---

### B42 — Medium: `duckpump` only ticks on `Scene_Map` — **Fixed 2026-10-30**

**Where:** Core `Scene_Map.prototype.update` → `runUpdateHooks()`; `FugsAudio4Dynamics.js` `onUpdate` → `updatePump()`

**What is wrong:** Pump phase is advanced only from map `onUpdate`. Menu, shop, battle, and title do not call `runUpdateHooks`. `updatePump` writes `_pumpGainNode.gain` from wall-clock phase, so while those scenes are up the last scalar **sticks**. Returning to the map jumps to the correct beat.

Factory `pauseMode: battle` does **not** pause in the menu, so this is audible with Dynamics + `duckpump` under defaults.

Sidechain and pansweep are **not** this bug: they drive themselves with `requestAnimationFrame` / FadeManager (N27, N32).

**Triggers:** `duckpump 120 0.8 sine bgm` on the map, open the menu. Duck amount freezes until the menu closes.

**Fix:** Run update hooks from `Scene_Base.prototype.update` (or at least Menu/Battle), or drive pump from RAF like sidechain.

---

### B43 — Low: First `playAlias` blocked while `cooldown > performance.now()` — **Fixed 2026-10-30**

**Where:** `FugsAudio6Aliases.js` `playAlias`

**What is wrong:** Missing cooldown timestamps become `lastPlayed = 0`. The check is `now - 0 < cooldown`. `performance.now()` is ms since page (or process) start, so a 5s cooldown cannot play at all until the game has been running for 5s. The first play never reaches `playAudio` and does not write `aliasLastPlayed`.

**Triggers:** `registeralias Footstep {pool:[a], cooldown:5000}` then play within 5s of boot.

**Fix:** Treat a missing map entry as “never played” (`if (!this.aliasLastPlayed.has(aliasName))` skip the cooldown), not as time 0.

---

### B45 — Medium: Cold paused restore snapshots proximity volume — **Fixed 2026-10-30**

**Where:** `loadTrackState` → `_restorePausedTrack` (deferred pause) then `_runRestoreHooks`; `FugsAudio3Spatial.js` restore calls `updateProximityVolume`; `pauseAudio` snapshots `buffer.volume`

**What is wrong:** For a cold buffer, pause waits on `addLoadListener` (**B12**). Restore hooks still run immediately and proximity writes `buffer.volume`. When decode finishes, `pauseAudio` snapshots that attenuated volume (**B34**). Resume then treats the proximity level as the mixer volume and attenuates again.

**Triggers:** Save a paused proximity track, load while the file is not in cache.

**Fix:** Run restore hooks after `finalizePause`, or pause using the saved mixer volume (`_manualVolume` / snapshot.volume) and apply proximity only after pause state is stored.

---

### B46 — Medium: `syncPlay` ignores `(p:)` and `(pause:)` — **Fixed 2026-10-30**

**Where:** `executeCommand` `case "syncplay"`; `syncPlay`

**What is wrong:** `parseCommand` still fills `commandObject.persistence` / `pauseMode`, but `syncPlay` always writes `DefaultPersistenceMode` / `DefaultPauseMode` onto every stem. `syncplay-bgm Drums Bass (p:always) (pause:never)` plays with factory scene/battle policy.

**Triggers:** Layered stems that must survive battle: `syncplay-bgm Drums Bass (p:always)`.

**Fix:** Pass `commandObject.persistence` and `pauseMode` into `syncPlay` (and onto each buffer).

---

## Risky / unconfirmed

Still fragile; not promoted. Dismissed looks live in **Not a bug**.

| Area | Notes |
|------|-------|
| Repeat `buffer.play(false, 0)` + effects | Repeat reconnects after `play()`. If MV creates `_sourceNode` asynchronously, same class as B26 on looped one-shots. |
| `registeralias` pool parser | `pool:[a,b,c]` splits on commas; quoted names with spaces inside the brackets are not handled. |
| `fadeOutEffect` non-numeric duration | Plugin path uses `toNum`. Direct `fadeOutEffect(key, NaN)` never completes the fade while `setTimeout(NaN)` fires immediately. |
| RAF vs suspended `AudioContext` | Watchdog uses wall-clock `performance.now` in background tabs; on focus, mixer state can jump to fade end. |
| Mid-fade save | `captureTrackState` stores the in-progress `buffer.volume`, not the fade target. Restore does not resume the fade. Expected for most games; not promoted. |
| `duckpump` bpm 0 | `toNum(0)` keeps 0; `60/0` is `Infinity` and phase sticks at 0. Unlikely command. |

---

## Not a bug

Re-checked against current source on 2026-08-13. These were investigated (often from the old risky list) and are **not** defects. Do not re-open them as bugs without new evidence.

| ID | Item | Why it is not a bug |
|----|------|---------------------|
| N01 | Plugin-command quote re-parse | `isKnownPluginCommand` is registry-aware (`_handlers` keys + builtins, `startsWith(action + "-")`). `fadeall-*`, `duckall-*`, `chain-*`, `registeralias`, etc. get full-string quote re-parse. |
| N02 | `(loop:N)` / numeric loop | JSDoc on `play()`: `N` is extra repeats after the first play (`1` = play twice). `normalizeLoop` + `_fugsLoopRepeatsRemaining` match that. |
| N03 | `toNum(0)` | `toNum` uses `Number.isNaN` / `Number.isFinite` and keeps `0`. Tests cover it. Not the `Number(x) \|\| default` trap. |
| N04 | Silent logging (`Debug Logs` = 1) | `Number("1") \|\| 2` is `1`. `Logger.warn` is log ≥ 3; `Logger.error` is log ≥ 2. Silent hides everything, including errors, which matches “Silent (for production)”. |
| N05 | `DefaultDopplerScale` `\|\| 1.0` | Plugin param `@min 0.1`, so Plugin Manager cannot set `0`. Spatial reads `hub.config.defaultDopplerScale` (already coalesced). Script `dopplerScale: 0` on a proximity config still works (`!= null`). |
| N06 | `key.startsWith(type)` for bgm/bgs/me/se | Types are fixed four strings. `bgm` does not prefix `bgs`. Would only collide if a custom type were added. |
| N07 | `handleSceneTransition("menu")` unused | Menu pause is `Scene_Menu.start` / `terminate`, not that helper. The helper’s `"menu"` pause branch is dead; the real holes are B19 (wrong scene) and B18 (scene pause never resumes). |
| N08 | Pause-over-stop in `handleSceneTransition` | Documented: if pauseMode says pause, pause wins over persistence stop. Intentional. |
| N09 | Foreign plugin commands | Dashless unknown commands parse as type `all` and hit `Unknown command action`, but `Logger.warn` is silent at default log 2. Dashed unknown types (`foo-bar`) fail the type check and return null. No-op at factory logging. |
| N10 | No playbook `(effect:)` tag | There is no `(effect:…)` paren parser. Effects are `effect-*` / `play(..., { effect })`. Not a dropped tag. |
| N11 | Title Continue, same key | `Scene_Title.start` `stopAll`, then load. `playAudio` on an existing key `stopAudio(0)` first. Same-key replace is safe. In-game Load leftover extras are **B17**. |
| N12 | Missing file ≠ B30 timer | `_scheduleTrackEndAction` waits on `addLoadListener` if not ready. A 404 never becomes ready, so it does **not** enter the 200ms `_totalTime === 0` retry. Track sits in `this.tracks` until cleanup. B30 is only ready + `_totalTime === 0`. |
| N13 | Crossfade positional curve | `crossfade` inspects `rest[0]` against the curve name list. `crossfade-bgm1 Theme 3 linear` works. Fade positional curve is **B40**. |
| N14 | Script `fade({ curve })` | `FugsAudio.fade(..., { curve: 'linear' })` passes `opts.curve` into `fadeAudio`. Plugin-command positional curve is B40; this path is fine. |
| N15 | `_sceneTransitionHooks` never fired | `onSceneTransition` is a public hook. No satellite registers it. Dead API, not a user-facing audio bug unless an external plugin uses it. |
| N16 | Switch first OFF | `oldValue` is often `undefined`; `undefined !== false` calls `executeSwitch(id, false)` → `stopSwitchCommands`. `activeList` is empty, so it is a no-op. |
| N17 | `SwitchBuffer.clearSwitch` / `clearAll` | Test/debug API. They drop command buffers without stopping audio. Not hooked to Title/New Game (that gap is **B25**). |
| N18 | OcRam `typeof` check | `FugsAudio7Compat` guards `typeof OcRam_Audio_EX !== "undefined" \|\| window.OcRam_Audio_EX` and skips if `fadeOutBgs` is missing. Soft no-op without OcRam. |
| N19 | Effects `init()` at satellite load | `FugsAudio2Effects` calls `AudioEffects.init()` at load; `applyEffect` also lazy-grabs context if init ran too early. |
| N20 | Fugs does not mute MV BGM | Separate mixer from `AudioManager.playBgm`. By design; Play BGM event commands still work alongside Fugs tracks. |
| N21 | Docs `sidechain-bgm 1 2` | `setupSidechain` reads `args[0]` / `args[1]` as source/target and looks up `bgm_${id}` only. `sidechain-bgm 1 2` is correct. `sidechain-bgm1 2 3` sourcing 2→3 is a footgun, not a docs/code mismatch. BGM-only is intentional. |
| N22 | Playbook loop documentation | The parser and `playAudio` support `(loop:forever\|never\|N)`; the playbook now lists the tag with the other playback options. |
| N23 | Crossfade `_manualVolume` window | Incoming `playAudio` at volume 0 sets `_originalVolume` to 0 until fade-in writes `_manualVolume`. Same family as **B36** (cold + proximity). Not a separate crossfade bug. |
| N24 | Alias `persistence: none` | `playAlias` hard-sets `persistence: "none"`, `pauseMode: "never"`. Correct for one-shot SFX. |
| N25 | `_syncGroup = Date.now()` | The group tag is for logging. On MV, `startSyncedBuffers` schedules fresh source nodes at the common 50ms start time (**B28**). |
| N26 | Positional play start (6th arg) | `checkStartTime` defaults to `0` (falsy), so `commandObject.startTime \|\| toNum(args[5], 0)` still reads a positional offset. Contrast **B40**, where default `"smooth"` is truthy. |
| N27 | Pump vs proximity gain | Proximity writes `buffer.volume` (gain). Pump writes `_pumpGainNode.gain` after gain. They multiply. Sidechain fighting `buffer.volume` is **B27**; pump layering is intended. |
| N28 | Core `duckpump` switch-case | `_registerCoreLifecycle` registers a soft stub (or Dynamics overwrites it). `executeCommand` hits `_handlers` first. The switch-case body is dead leftover, not a double-start. |
| N29 | `Scene Fadeout Time` = 0 | `!isNaN(0)` keeps `0`. Instant cuts on transitions. Allowed (`@min 0`). |
| N30 | Switch already ON at register | `onSwitchGatedCommand` calls `executeSwitch(id, true)` if `$gameSwitches.value(switchId)` is already true. Commands fire immediately when registered on an ON switch. |
| N31 | Named snapshots other than `auto` | `makeSaveContents` always `saveAllStates("auto")` then serializes all named snapshots. Load only `loadAllStates("auto")`. Other names stay in the Map for `loadall`. By design. |
| N32 | Proximity / pansweep / sidechain off the map | Proximity `onUpdate` is map-only; the player does not move in menus. Pansweep is FadeManager RAF; sidechain is its own RAF. They keep running. Only **duckpump** freezes (**B42**). |
| N33 | `persistence: none` continues in the menu | Playbook table: none + never → Menu **Continues**, Battle **Stops**. Map→Menu does not call `handleSceneTransition` (only battle/map). Matches the table. Plugin Manager “stops on any transition” is the coarse one-liner. |
| N34 | MV Options BGM/BGS volume | Fugs writes `buffer.volume` directly. It does not multiply `AudioManager.bgmVolume`. Independent mixer, same family as **N20**. |
| N35 | `chain-*` requires a live track | `executeChain` captures `originalBuffer` up front. If the slot is empty, every timeout sees `!currentBuffer` and cancels. Playbook examples are fade/wait/stop on an already-playing track, not `chain-bgm1 play …`. |

Promoted out of the old risky list (now open bugs, not dismissed): `loadGame` leftover → **B17**; Gameover → **B20**; aliases → **B22**; pump×sidechain → **B23**; switch OFF play-only → **B24**; sidechain vs volume → **B27**; unused sync startTime → **B28**; dashless syncplay → **B29**.

---

## Review history

| Date | Coverage |
|------|----------|
| 2026-07-16 | Initial pass: playback, fades, pause/resume, scene/battle hooks, switches, effects, sidechain, save/load, command parsing |
| 2026-07-16 | Second pass: proximity, sidechain timing/leaks, save/load spatial state, bulk fade/duck consistency, gameover/alias risks |
| 2026-08-09 | B01–B16 fixed and smoke-tested |
| 2026-08-13 | Third pass (modular pack): load leftover tracks, pauseMode scene/menu holes, New Game reset, Gameover, switch/alias persistence, pump×sidechain, cold-buffer effects, event-bound proximity across maps, `duckall-sidechain` B13 hole, duck-hold vs pause |
| 2026-08-13 | Fourth pass: save/pause snapshot of proximity volume, fade cancel vs duck, fade-in vs proximity on cold buffers, effect dry-path bypass, blunt `activeTimeouts`, DelayNode maxDelay |
| 2026-08-13 | Verification pass: re-read current sources for B17–B39. Corrected B17 title-Continue overlap (same-key replace is safe), B26 cold-cache-only, B30 (not a 404 timer loop), B34 not a factory-default, B38 pause vs stop. B01–B16 fix sites still present. |
| 2026-08-13 | Fifth pass: positional fade curve (**B40**), alias cooldown on failed play (**B41**), pump frozen off-map (**B42**). Re-checked old risky items; wrote **Not a bug N01–N32**. Expanded B19 (Shop/Name from events). |
| 2026-08-13 | Sixth pass + claim tests: first-play alias cooldown (**B43**), cold paused+proximity snapshot (**B45**), syncPlay drops `(p:)`/`(pause:)` (**B46**). Dismissed menu+`persistence:none` (**N33**), MV volume slider (**N34**), chain-on-empty-slot (**N35**). `scripts/assert-bugs.js` locks B17–B46 and N01–N35. |
| 2026-10-30 | Seventh pass: **B17–B46 fixed** across core + satellites. Ledger updated; `scripts/assert-bugs.js` inverted to assert fix presence (runtime + source regex). N01–N35 dismissals unchanged. |

---

## Fix priority (suggested)

**All items below are fixed as of 2026-10-30.** Retained for historical triage order.

1. **B17 / B25 / B34** — Load leftover tracks, New Game not resetting runtime, save/pause capturing proximity volume.
2. **B18 / B19** — Pause-mode resume holes (scene never resumes; menu resumes in submenus / misses Shop).
3. **B26 / B37** — Effects silently missing on first play / cold restore; dry path bypassing filters.
4. **B20 / B31** — Game Over audio bleed; proximity event IDs surviving map transfer.
5. **B21 / B22** — Switch commands and aliases dropped on load.
6. **B23 / B27 / B32 / B33 / B35 / B38 / B42** — Dynamics + timeout bucket: pump vs sidechain, gain fights, paused skip hole, duck-hold/fade-cancel/chain killed by pause, pump frozen in menus.
7. **B24 / B36 / B40** — Switch OFF play-only; fade-in vs proximity on cold buffers; positional fade curve dead.
8. **B28–B30 / B39 / B41 / B43** — syncPlay timing, dashless type, missing-file timer leak, delay maxDelay, alias cooldown on failed play / first-play `now < cooldown`.
9. **B45 / B46** — cold paused+proximity double attenuation; syncPlay ignores scene policy tags.

## Verification follow-up — 2026-10-30

- Distance-muted tracks could stay silent after the listener returned, and cold or fading tracks could miss their first distance update. Proximity now retries deferred updates and distinguishes a pending fade from distance silence.
- A ready one-shot with zero duration stopped retrying but remained tracked. The retry limit now stops it, runs teardown while its buffer is available, and removes it.
- The engine model now includes the menu base class, sidechain checks measure the output graph, and the example audio fixture includes BossTheme. The loop documentation and dev curve checks now match the parser.
