# FugsMultiTrackAudioEX — Known Bugs

**Source:** `FugsMultiTrackAudioEX.js`  
**Last updated:** 2026-07-16  
**Status legend:** Open · Confirmed in code · Fix not applied

This file tracks confirmed defects found by code review. Severity reflects user impact under default or common setups.

---

## Summary

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| B01 | Critical | Battle auto-pause never resumes | Open |
| B02 | High | Plugin commands drop `(loop:…)` | Open |
| B03 | High | Re-pausing wipes saved seek position | Open |
| B04 | High | Resume of one-shot tracks never re-arms end cleanup | Open |
| B05 | High | Event-bound proximity frozen while player stands still | Open |
| B06 | High | Save/load drops proximity (and related spatial state) | Open |
| B07 | High | Re-calling `sidechain` leaks old connections | Open |
| B08 | Medium | FadeManager can double-fire `onComplete` | Open |
| B09 | Medium | `cleanupOrphanedTracks` drops buffers without release/stop | Open |
| B10 | Medium | Effect crossfade half-duration race | Open |
| B11 | Medium | Sidechain attack/release times wrong (~sampleRate vs frame) | Open |
| B12 | Medium | Paused save restore can blip or lose seek position | Open |
| B13 | Medium | Per-type “all” commands hit paused tracks; global “all” skips them | Open |
| B14 | Medium | Proximity gated on tile coords, not smooth movement | Open |
| B15 | Low–Medium | Manual resume doesn’t refresh proximity volume | Open |
| B16 | Low | Pause-with-fadeout blocks resume until timeout | Open |

---

## Confirmed bugs

### B01 — Critical: Battle auto-pause never resumes

**Where:** `Scene_Battle.prototype.terminate` (~7978–7984), `Scene_Menu.prototype.terminate` (~7997–8011), `handleSceneTransition` (~7034–7097); defaults ~1069–1070 / `@param` ~58–62

**What’s wrong:** Default `pauseMode: battle` pauses tracks on battle enter, but battle exit never resumes them. Menu has an explicit resume path; battle only calls `handleSceneTransition("scene")`, which neither resumes nor stops paused tracks.

**Triggers:** Play BGM with defaults → enter battle → leave battle. Track stays in `pausedTracks` (silent).

**Suggested fix:** On battle→map (and/or map create after battle), resume tracks with `_pauseMode === "battle"` (mirror menu terminate).

---

### B02 — High: Plugin commands drop `(loop:…)`

**Where:** `Game_Interpreter.prototype.pluginCommand` `commandObj` (~8069–8079) vs `parseClassicSyntax` / `checkLoop` (~6905–6916) and `testCommand` (~7429–7436)

**What’s wrong:** Parsing returns `loop`, and `executeCommand` / `playAudio` honor it, but the live plugin-command path never copies `loop` into `commandObj`. `FugsAudio.testCommand()` does include it — console/script works, event Plugin Commands don’t.

**Triggers:** `play-se1 Hit (loop:3)` (or any `(loop:N|forever|never)`) from a Plugin Command → always uses type defaults (SE once, BGM forever).

**Suggested fix:** Add `loop: parsed.loop` to `commandObj` (and keep it on switch-buffered commands).

---

### B03 — High: Re-pausing wipes saved seek position

**Where:** `pauseAudio` (~5354–5470)

**What’s wrong:** No “already paused” guard. A second pause calls `buffer.seek()` on a stopped buffer (often `0`) and overwrites `pausedSnapshots`.

**Triggers:** Manual `pause` then enter battle with `pauseMode: battle`; or any double pause. Resume restarts from 0.

**Suggested fix:** Early-return if `pausedTracks.has(key)`; or don’t overwrite snapshot when already paused.

---

### B04 — High: Resume of one-shot tracks never re-arms end cleanup

**Where:** `resumeAudio` forever/never path (~5558–5655) vs `playAudio` `scheduleEndAction` (~4227–4293); pause clears timeouts (~5410–5416)

**What’s wrong:** Pause cancels end timers. Resume recreates the buffer and plays, but only the `repeat` path goes through `playAudio` (which reschedules). `never` (SE/ME) and similar finish with no auto-cleanup → stale entries in `tracks`.

**Triggers:** Pause a one-shot mid-play → resume → let it finish. Track remains registered.

**Suggested fix:** After resume `play()`, call the same end-scheduling logic used in `playAudio` for non-forever modes.

---

### B05 — High: Event-bound proximity frozen while player stands still

**Where:** `Scene_Map.update` (~7944–7959), `updateProximityVolume` (~6324–6500)

**What’s wrong:** Proximity only updates when `$gamePlayer.x` / `$gamePlayer.y` (tile coords) change. Event-following sources use event `_realX`/`_realY`, but that logic never runs if the player doesn’t change tiles.

**Triggers:** `proximity-bgm1 {event:5,...}` (or doppler); stand still; move the event toward/away. Volume/pan stay frozen until the player moves.

**Suggested fix:** Dirty-flag on event movement, or call `updateProximityVolume()` every frame while `proximityData.size > 0`.

---

### B06 — High: Save/load drops proximity (and related spatial state)

**Where:** `captureTrackState` / `getSaveData` (~6604–6694, ~6765–6791), `loadTrackState` (~6710–6746), DataManager hooks (~8018–8040)

**What’s wrong:** Saved state is mixer-only. `proximityData` (and pan sweeps, sidechain links, pump state) are never serialized. Restore only `playAudio()` + optional `pauseAudio()` — no proximity re-bind.

**Triggers:** Set proximity → save → load (or `saveall`/`loadall`). Track plays at wrong volume/pan; spatial behavior is gone.

**Suggested fix:** Persist per-key proximity config; on restore call `setupProximitySource()` and refresh volume once.

---

### B07 — High: Re-calling `sidechain` leaks old connections

**Where:** `setupSidechain` (~4534–4658)

**What’s wrong:** Always creates a new analyser + RAF loop and `sidechainConnections.set(...)` without disposing an existing entry for the same `sourceId_to_targetId`. Old RAF/analyser keep running.

**Triggers:** Run `sidechain-bgm 1 2 ...` twice with the same source/target. Multiple envelope loops fight over target gain; Web Audio nodes leak.

**Suggested fix:** If `this.sidechainConnections.has(connectionKey)`, call `_disposeSidechainConnection()` first.

---

### B08 — Medium: FadeManager can double-fire `onComplete`

**Where:** `FadeManager.update` / `_watchdog` (~2766–2812)

**What’s wrong:** RAF and the 100ms watchdog can both run `update()` before fades are deleted → `onComplete` twice (duck restore, multi-param fades, chained callbacks).

**Triggers:** Tab backgrounded / RAF stall near fade end; heavy GC.

**Suggested fix:** Mark fade completed before calling `onComplete`, or skip if key already removed; serialize watchdog vs RAF.

---

### B09 — Medium: `cleanupOrphanedTracks` drops buffers without release/stop

**Where:** `cleanupOrphanedTracks` (~7100–7127)

**What’s wrong:** “Dead” tracks get `cleanupTrack` only — no `buffer.stop()` / `_releaseBuffer()`. Runs on every scene transition.

**Triggers:** Finished SE still mapped with `isPlaying() === false`; spurious `isPlaying` false mid-gap.

**Suggested fix:** Stop + `_releaseBuffer` before dropping; be stricter about what counts as orphaned.

---

### B10 — Medium: Effect crossfade half-duration race

**Where:** `crossFadeEffect` (~6153–6205); comments at ~6173–6180 already note the race

**What’s wrong:** Fade-out cleanup timeout and mid-point `fadeEffect` both target the same key/`effectChains` entry; order can clear or replace the wrong chain.

**Triggers:** `crossfadeEffects` / effect crossfade under load or with short durations.

**Suggested fix:** Single sequenced state machine (generation token); don’t rely on two independent timers.

---

### B11 — Medium: Sidechain attack/release times wrong (~sampleRate vs frame)

**Where:** `setupSidechain` envelope coeffs (~4600–4610)

**What’s wrong:** Envelope smoothing runs in a RAF callback (~60 Hz) but uses `Math.exp(-1 / (attack * context.sampleRate))`. `sampleRate` is per-sample, not per-frame, so attack/release behave like multi-second envelopes instead of documented seconds.

**Triggers:** `sidechain-bgm 1 2 0.5 4 0.01 0.1` — ducking/release is sluggish regardless of attack/release args.

**Suggested fix:** Use frame delta (`Math.exp(-dt / attack)` with `dt ≈ 1/60`), or drive the follower with `AudioParam.setTargetAtTime`.

---

### B12 — Medium: Paused save restore can blip or lose seek position

**Where:** `loadTrackState` (~6710–6740), `playAudio` (~4111–4332), `pauseAudio` (~5354–5468)

**What’s wrong:** Restore calls `playAudio()` then immediately `pauseAudio([0])` with no wait for decode/load. `seek()` may still be 0; playback may audibly start before stop.

**Triggers:** Save while paused mid-song → load on slow/cold cache. Brief audio blip and/or wrong resume position.

**Suggested fix:** Load-aware restore path: wait for `isReady()` / load listener, seek to `state.currentTime`, then stop and snapshot.

---

### B13 — Medium: Per-type “all” commands hit paused tracks; global “all” skips them

**Where:** `fadeAllAudio` / `duckAllAudio` (~4973–5036, ~5138–5155) vs `fadeAllOfType` / `duckAllOfType` / `pitchBendAll*` (~5005–5036, ~5217–5248)

**What’s wrong:** Global fade/duck skip `pausedTracks`. Per-type and pitch-bend-all paths do not. Changes apply to the stopped buffer, not `pausedSnapshots`, so resume restores pre-pause values.

**Triggers:** Auto-pause BGM → `fadeall-bgm 30 2` or `duckall-bgm 0.3 1 2` → resume. Volume unchanged from snapshot; duck appeared to do nothing.

**Suggested fix:** Skip `pausedTracks` (or update snapshots when intentionally modifying paused tracks) in all `*AllOfType` / `pitchBendAll*` paths.

---

### B14 — Medium: Proximity gated on tile coords, not smooth movement

**Where:** `Scene_Map.update` (~7948–7959); inner proximity math uses `_realX`/`_realY`

**What’s wrong:** Even for fixed sources, proximity only recalculates when the player crosses a tile boundary, not while moving within/between tiles. Volume/pan steps instead of updating smoothly.

**Triggers:** Proximity on a fixed map point; walk slowly. Updates happen in tile jumps.

**Suggested fix:** Compare `_realX`/`_realY`, or run proximity every frame while active. (Overlaps with B05.)

---

### B15 — Low–Medium: Manual resume doesn’t refresh proximity volume

**Where:** `resumeAudio` forever/never path (~5558–5654)

**What’s wrong:** Manual resume rebuilds the buffer but never triggers proximity recalc. Wrong level until the player moves (same tile gate as B14/B05).

**Triggers:** Proximity track → pause → resume in place. Volume wrong until movement.

**Suggested fix:** Call `updateProximityVolume()` after successful resume when `proximityData.has(key)`.

---

### B16 — Low: Pause-with-fadeout blocks resume until timeout

**Where:** `pauseAudio` fadeout branch (~5422–5460); `resumeAudio` (~5476–5478)

**What’s wrong:** `pausedTracks` is only set when the timeout fires. Resume during fadeout fails (`not paused`); then the timeout still stops and marks paused.

**Triggers:** `pause-bgm1 2` then immediately `resume-bgm1`.

**Suggested fix:** Mark paused (or “pausing”) immediately; cancel pending pause timeout on resume.

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

1. **B01** — Broken with default settings; silent BGM after every battle.
2. **B02** — Documented `(loop:…)` syntax silently ignored from Plugin Commands.
3. **B03 / B04 / B16** — Pause/resume correctness cluster.
4. **B05 / B14 / B15** — Proximity update cluster (one fix likely covers all three).
5. **B06 / B12** — Save/load fidelity.
6. **B07 / B11** — Sidechain correctness + leak.
7. **B08–B10, B13** — Fade/cleanup races and bulk-command consistency.
