# FugsMultiTrackAudioEX Plugin

## Description
v1.0 Unlimited audio tracks with advanced fading and crossfading capabilities for BGM, BGS, ME, and SE audio in RPG Maker MV.

---

## Parameters

### Debug Logs
- **Type:** Boolean
- **Description:** Toggle debug logs (console output).
- **Options:** `Enable` / `Disable`
- **Default:** `false`

---

## Features

1. **Unlimited Tracks:**
   - Play multiple tracks of the same or different audio types simultaneously.

2. **Advanced Audio Control:**
   - Seamless fade-in, fade-out, and crossfading for all audio types.

3. **Independent Track Management:**
   - Prevents conflicts with the default audio system or other plugins (e.g., OC Rams Audio EX).

---

## Why Use This Plugin?

This plugin offers extensive control and flexibility over audio transitions, such as:
- Seamlessly fading a BGM into a BGS.
- Layering SEs with precise adjustments for pan, pitch, and volume.

Integrates into your project without interfering with the stock audio system or any other plugins, allowing selective feature usage.

---

## Command Structure

### General Format
`[Command]-[Type][Track]? [Arguments]?`

- **Command:** Action to perform (e.g., play, fade, stop, crossfade).
- **Type:** Audio type (BGM, BGS, ME, SE).
- **Track:** (Optional) Specific track number (defaults to Track 1 if omitted).
- **Arguments:** (Optional) Parameters for the command (e.g., volume, fade duration).

#### Example Commands
- `play-bgs3 Scene1` - Plays a BGS on Track 3.
- `stop-bgs3` - Stops the BGS on Track 3 immediately.
- `play-bgs "Title Music" 90 3` - Plays BGS with spaces in its name, 90% volume, and 3s fade-in.

---

## Detailed Commands

1. **Play Audio**
   `play-[Type][Track]? [name] [volume]? [fadein]? [pan]? [pitch]?`
   - Plays the specified audio with optional adjustments.
   - **Example:** `play-bgs2 Scene1 90 5 -30 120`

2. **Fade Audio**
   `fade-[Type][Track]? [volume] [duration] [pan]? [pitch]?`
   - Gradually adjusts volume, pan, or pitch over time.
   - **Example:** `fade-bgm 30 3`

3. **Stop Audio**
   `stop-[Type][Track]? [fadeout]?`
   - Stops audio with an optional fade-out duration.
   - **Example:** `stop-bgm2 5`

4. **Crossfade Audio**
   `crossfade-[Type][Track]? [toTypeTo] [TrackId]? [name] [duration]`
   - Crossfades from one track to another smoothly.
   - **Example:** `crossfade-bgm2 bgm3 Scene2 5`

---

## Important Notes

- **Track Numbers:** Optional. Defaults to Track 1 if omitted.
- **Default Values:**
  - Volume: 90%, Pan: 0, Pitch: 100%.
  - Audio plays/stops immediately if fade-in/out duration is not provided.
- **Quoted Names:** Audio files with spaces in their names require quotes.

---

## Known Issues & To-Do

1. **Command Parsing:**
   - `parseArguments` method may struggle with special characters or nested quotes.

2. **Performance:**
   - Excessive fade operations using `setInterval` could lead to performance issues. Optimization with `requestAnimationFrame` is under consideration.

3. **Nonexistent Tracks:**
   - Implement better error handling for invalid track IDs or audio types.

4. **Fade Precision:**
   - Avoid rounding errors during volume/pan/pitch adjustments, especially for small durations.

---

## Final Notes

- The plugin operates independently of RPG Maker's stock audio system.
- Designed to work alongside other audio plugins without conflicts.
