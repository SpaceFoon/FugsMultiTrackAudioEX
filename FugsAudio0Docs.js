//=======================================================================//
//                         FugsAudio0Docs.js                             //
//=======================================================================//
/*:
 * @plugindesc v2.2 Documentation / playbook for Fugs MultiTrack Audio
 * @target MV 1.63
 * @author Fug
 *
 * @help

 * =========================================================================
 * 1) WHY THIS EXISTS
 * =========================================================================
 * MV gives you 1 BGM + 1 BGS + 1 ME + 1 SE at a time with little control.
 * That blocks modern game-audio patterns.
 *
 * This plugin unlocks:
 *   - Layered music (stems): drums/bass/pads/lead always in sync.
 *   - Dynamic intensity: fade layers in/out as gameplay escalates.
 *   - Spatial audio: pan sweeps + proximity panning.
 *   - Effects as storytelling: underwater, radio, haunted spaces.
 *   - Persistence/pause control: don’t restart ambience every transition.
 *   - Console-first experimentation: iterate with FugsAudio.testCommand().
 *
 * =========================================================================
 * 2) MENTAL MODEL (READ THIS ONCE)
 * =========================================================================
 * Track identity:
 *   Internal keys are: {type}_{trackId} (example: bgm_1, bgs_2).
 *   Plugin commands use: {type}{trackId} (example: play-bgm1, fade-bgs2).
 *
 * “Type” is one of: bgm, bgs, me, se.
 * “TrackId” is a number: 1, 2, 3...
 *
 * What a track contains (independent per track):
 *   - Mixer: volume, pan, pitch
 *   - Automation: fades on volume/pan/pitch (with named curves)
 *   - Effects: a WebAudio node chain (raw effects and/or presets)
 *   - Scene policy: persistence + pauseMode
 *   - Spatial policy (optional): proximity binding + optional doppler
 *   - Start offset (optional): (start:seconds)
 *
 * Scene policy is two knobs:
 *   - persistence: whether the track STOPs on transitions
 *   - pauseMode:  whether the track auto-PAUSEs (and later resumes)
 *
 * Ducking / sidechain / pump are different tools:
 *   - duck / duckall: fixed temporary volume reduction then restore.
 *   - duckall-sidechain: duck everything EXCEPT specified tracks.
 *   - sidechain-bgm: true envelope follower driven by another track’s RMS.
 *   - duckpump: tempo-synced rhythmic modulation (sine/square/saw/heartbeat).
 *
 * =========================================================================
 * 3) QUICK START (3 MINUTES)
 * =========================================================================
 * All commands go in Event -> Plugin Command.
 *
 * Play 2 tracks at once:
 *   play-bgm1 ThemeSong
 *   play-bgs1 Rain 60 2
 *
 * Fade one:
 *   fade-bgs1 0 3
 *
 * Apply a preset:
 *   effect-bgm1 preset:cave
 *
 * Stop everything:
 *   stopall 1
 *
 * Same flow via script calls:
 *   FugsAudio.play('bgm', 1, 'ThemeSong', { volume: 90, fadein: 0 });
 *   FugsAudio.play('bgs', 1, 'Rain', { volume: 60, fadein: 2 });
 *   FugsAudio.fade('bgs', 1, { volume: 0, duration: 3, curve: 'smooth' });
 *   FugsAudio.setEffect('bgm', 1, 'cave');
 *   FugsAudio.stopAll(1);
 *
 * =========================================================================
 * 4) COMMAND GRAMMAR + DEFAULTS (ONE PLACE)
 * =========================================================================
 * Classic plugin-command format:
 *   [action]-[type][track]? [args...]
 *
 * type: bgm | bgs | me | se (case-insensitive)
 * track: optional number (defaults to 1)
 *
 * Defaults (unless you override them in the command/options):
 *   - trackId: 1
 *   - volume:  90 (0..100)
 *   - pan:     0 (-100..100)
 *   - pitch:   100 (10..400)
 *   - fadein:  0 seconds
 *   - fadeout: 0 seconds
 *   - fade curve: smooth
 *   - persistence: scene
 *   - pauseMode: battle
 *   - startTime: 0 seconds
 *
 * Parsing notes:
 *   - Filenames with spaces should be quoted: "Battle Theme".
 *   - Optional tags:
 *       (p:none|scene|battle|always)
 *       (pause:never|menu|battle|scene)
 *       (start:seconds)
 *
 * Fade curves (named):
 *   linear, exponential, logarithmic, smooth, sharp, gentle,
 *   ease-in, ease-out, ease-in-out
 *
 * NOTE: "custom" curves apply to PROXIMITY distance falloff (see below).
 *
 * =========================================================================
 * 5) FEATURE CHAPTERS (PLAYBOOK STYLE)
 * =========================================================================
 * Each chapter follows: Why -> Minimal -> Recipes -> Full reference -> Pitfalls.
 *
 * -------------------------------------------------------------------------
 * 5.1 BASIC PLAYBACK (play / stop / fade / crossfade)
 * -------------------------------------------------------------------------
 * Why:
 *   - Layer ambience under music.
 *   - Fade for cutscenes without pops.
 *   - Crossfade between moods.
 *
 * Minimal:
 *   play-bgm1 ThemeSong
 *   fade-bgm1 50 3
 *   stop-bgm1 2
 *
 * Recipes:
 *   - Crossfade to battle music:
 *       crossfade-bgm1 BattleTheme 3
 *   - Pitch-bend time slow (all BGM):
 *       pitchbendall-bgm 80 2
 *
 * Full reference:
 *   play-[Type][Track]? [name] [volume]? [fadein]? [pan]? [pitch]?
 *     (p:mode)? (pause:mode)? (start:seconds)?
 *       volume: 0..100 (default 90)
 *       fadein: seconds (default 0)
 *       pan:    -100..100 (default 0)
 *       pitch:  10..400 (default 100)
 *
 *   stop-[Type][Track]? [fadeout]?
 *       fadeout: seconds (default 0)
 *
 *   fade-[Type][Track]? [volume] [duration] [pan]? [pitch]? [curve]?
 *       curve defaults to smooth
 *
 *   crossfade-[Type][Track]? [toTrack]? [name] [duration] [curve]? [volume]?
 *       duration default: 2
 *       curve default: smooth
 *       volume default: 90
 *
 * -------------------------------------------------------------------------
 * 5.3 STEM MIXING / SYNCHRONIZED PLAYBACK (syncplay-*)
 * -------------------------------------------------------------------------
 * Why:
 *   - Intensity layers without restarting music.
 *
 * Minimal:
 *   syncplay-bgm Drums Bass Pads Lead
 *   fade-bgm2 60 2
 *
 * Rule that keeps it working:
 *   - Don’t stop stems; fade to 0 to keep sync.
 *   - All stems MUST be the same length for looping to stay in sync.
 *
 * Full reference:
 *   syncplay-[Type] [name1] [name2] ... [vol1]? [vol2]? ...
 *     - Track numbers assigned sequentially: first stem => track 1, etc.
 *     - Default volumes: stem1=90, rest=0
 *
 * -------------------------------------------------------------------------
 * 5.4 EFFECTS (raw effects + presets + fade/crossfade + clear)
 * -------------------------------------------------------------------------
 * Why:
 *   - Make spaces feel different (cave/underwater).
 *   - “Through-device” voices (radio/phone).
 *   - Stylized story beats (retro/corrupted/haunted).
 *
 * Minimal:
 *   effect-bgm1 preset:underwater
 *   fadeouteffect-bgm1 2
 *
 * Recipes:
 *   - Environmental transition:
 *       crossfadeeffect-bgm preset:cave preset:underwater 4
 *   - Ping-pong / rhythmic echoes:
 *       effect-bgm multitap 0.2 0.35 0.4 0.25
 *
 * Full reference:
 *   effect-[Type][Track]? [effectType] [params...]
 *     - Presets: use preset:NAME (recommended)
 *       (shorthand without 'preset:' may also work: effect-bgm cave)
 *
 *   fadeeffect-[Type][Track]? [effectType] [params...] [fadeDuration]
 *   fadeouteffect-[Type][Track]? [duration]? (default 2)
 *   crossfadeeffect-[Type][Track]? [from] [to] [duration]? [params...] (default 3)
 *   cleareffect-[Type][Track]?
 *
 * Available effects (19):
 *   reverb, delay, lowpass, highpass, bandpass, distortion,
 *   bitcrusher, compressor, chorus, tremolo, vibrato, phaser,
 *   flanger, widener, eq3, ringmod, autopan, overdrive, multitap
 *
 * Available presets:
 *   Environmental: underwater, cave, city, dungeon, forest, space,
 *                  tavernRoom, mistyForest
 *   Communication: phone, radio, radioDistress
 *   Lo-Fi/Retro:   retro, corrupted, damaged, tapeEcho
 *   Dynamics:      gentle, squashed, broadcast, limiter, bassChamber
 *   Spatial:       scifi, jet, wide, ethereal, dizzy, flangedSpirit
 *   Fantasy:       shimmer, angelic, nightmare, frozen, memory, eldritchVoid
 *   Character:     tiny, giant, robot, overdrivenLute
 *   Atmospheric:   hauntedHall, cursedChapel, dungeonDepths, ghostWhisper
 *   Weather:       stormyWeather, heavyRain, snowStorm, thunderAftershock,
 *                  abyss, mechanicalHum, windHowl, hailOnTin, insideCabinRain,
 *                  monsoonWall, desertWind, blizzardWhiteout, lightningZap
 *   Combat:        explosionAftershock, impactThud, charging, swordClash,
 *                  magicCast, powerUp, defeatMoment, victoryTone, bloodlust,
 *                  adrenaline, slowMo, berserk, bossAura, criticalHitSting,
 *                  nearDeath
 *   Spooky:        poltergeist, possessedRadio, ritualChant, mirrorRealm
 *   Locations:     tinyBathroom, warehouse, stoneCorridor, openField
 *   Extreme:       glitchApocalypse, totalCrushed, voidReverb, tinnySpeaker,
 *                  boomy, chaosModulation, nightmareAugmented, blown
 *   Misc:          muffled, nextroom, psychotic, stutter, overdrive
 *
 * Performance note:
 *   - Effects are WebAudio node graphs; reverb is expensive.
 *   - Keep chains short when you have many tracks.
 *
 * -------------------------------------------------------------------------
 * 5.5 VOLUME DUCKING + SIDECHAIN + PUMP
 * -------------------------------------------------------------------------
 * Why:
 *   - Dialogue clarity.
 *   - Emphasis/pickups.
 *   - Rhythmic motion in dense mixes.
 *
 * Minimal:
 *   duckall 0.3 0.5 3
 *
 * Full reference:
 *   duck-[Type][Track]? [duckLevel] [fadeTime] [holdTime] switch:[id]?
 *     duckLevel: 0.0..1.0 (fraction)
 *     holdTime:  seconds (0 = infinite with switch control)
 *
 *   duckall [duckLevel] [fadeTime] [holdTime]
 *   duckall-[Type] [duckLevel] [fadeTime] [holdTime]
 *
 *   duckall-sidechain [exceptTracks...] [duckLevel] [fadeTime] [holdTime]
 *     Examples:
 *       duckall-sidechain bgm1 0.3 1 4
 *       duckall-sidechain bgm1 se1 0.2 0.5 3
 *
 * True sidechain compression (envelope follower):
 *   sidechain-bgm <sourceId> <targetId> [threshold] [ratio] [attack] [release]
 *     threshold default: 0.5 (0..1)
 *     ratio default: 4.0
 *     attack default: 0.01 seconds
 *     release default: 0.1 seconds
 *   stopsidechain-bgm <sourceId> <targetId>
 *
 * Rhythmic pump:
 *   duckpump [bpm] [depth] [shape] [tracks]
 *     bpm default: 120
 *     depth default: 0.5 (0..1)
 *     shape: sine|square|saw|heartbeat (default sine)
 *     tracks: bgm|bgs|se|me|all|bgm1... (default all)
 *   stoppump
 *
 * Footgun (known limitation): duck during active fades
 *   Duck captures CURRENT volume. If you duck a track mid-fade, it restores
 *   to the mid-fade value (the original fade target is effectively lost).
 *
 *   Bad:
 *     fade-bgm1 30 10
 *     duck-bgm1 0.2 1 3
 *
 *   Good:
 *     duck-bgm1 0.2 1 3
 *     fade-bgm1 30 10
 *
 * -------------------------------------------------------------------------
 * 5.6 PROXIMITY + DOPPLER + PAN
 * -------------------------------------------------------------------------
 * Why:
 *   - Waterfalls/campfires/machines that “live” in the world.
 *   - Fly-bys with doppler.
 *
 * Minimal:
 *   play-bgs1 Waterfall 100
 *   proximity-bgs1 {event:5, maxDistance:10}
 *
 * Full reference:
 *   proximity-[Type][Track]? {config}
 *     config keys:
 *       event: ID to follow
 *       player:true to follow player
 *       x,y fixed position
 *       maxDistance (default 10)
 *       minVolume (default 0)
 *       curve: linear|exponential|logarithmic|smooth|sharp|gentle|custom
 *       pan:true|false (default false)
 *       doppler:true|false (default false)
 *       dopplerScale (default 1.0)
 *
 *   Custom curve example:
 *     proximity-bgs1 {event:5, maxDistance:10, curve:custom,
 *       points:[0,1,0.5,0.8,1,0]}
 *     // points are [distance, volume] pairs normalized 0..1
 *
 * Performance note:
 *   - Proximity updates run on player movement; doppler recalculates pitch.
 *
 * -------------------------------------------------------------------------
 * 5.7 PAN SWEEPS
 * -------------------------------------------------------------------------
 * Minimal:
 *   pansweep-bgm -100 100 4
 *   stoppansweep-bgm
 *
 * Full reference:
 *   pansweep-[Type][Track]? [minPan] [maxPan] [duration] [loops]?
 *   stoppansweep-[Type][Track]?
 *
 * -------------------------------------------------------------------------
 * 5.8 SFX ALIAS POOLS (HUMANIZATION)
 * -------------------------------------------------------------------------
 * Minimal:
 *   registeralias FootstepGrass {pool:[step1,step2,step3], volumeJitter:5, pitchJitter:8}
 *   play-se alias:FootstepGrass
 *
 * Full reference:
 *   registeralias <name> {options}
 *   unregisteralias <name>
 *   listaliases
 *
 * Options (defaults shown):
 *   volume: 90, pitch: 100, pan: 0
 *   volumeJitter: 0, pitchJitter: 0, panJitter: 0
 *   cooldown: 0 (ms)
 *   pool: [filenames] (required)
 *
 * -------------------------------------------------------------------------
 * 5.9 SWITCH-CONTROLLED AUDIO
 * -------------------------------------------------------------------------
 * Minimal:
 *   play-bgm DangerTheme switch:15
 *   duck-bgm 0.3 1 0 switch:20
 *
 * Behavior:
 *   switch:ID is opt-in per command.
 *   The command gets registered when the event runs.
 *   After that, it fires on Game_Switches.setValue changes anywhere.
 *
 * Pitfall:
 *   If you never run the event containing the plugin command, nothing is registered.
 *
 * -------------------------------------------------------------------------
 * 5.10 SNAPSHOTS (saveall / loadall)
 * -------------------------------------------------------------------------
 * Minimal:
 *   saveall
 *   loadall
 *
 * Full reference:
 *   saveall [name]?    (default name: auto)
 *   loadall [name]?
 *
 * Automatic behavior:
 *   - auto snapshot saved before game save; restored after game load
 *   - battle transitions use snapshots internally
 *
 * -------------------------------------------------------------------------
 * 5.11 GLOBAL COMMANDS + CHAINS
 * -------------------------------------------------------------------------
 * Global:
 *   fadeall [volume] [duration]
 *   fadeall-[Type] [volume] [duration]
 *   stopall [fadeout]?
 *   stopall-[Type] [fadeout]?
 *   pauseall / resumeall
 *   pauseall-[Type] / resumeall-[Type]
 *   pitchbendall [pitch] [duration]
 *   pitchbendall-[Type] [pitch] [duration]
 *   listall / listall-[Type]
 *
 * Chains:
 *   chain-[Type][Track]? <commands>
 *     Example:
 *       chain-bgm fade 50 2; wait 3; fade 90 2; wait 5; stop 2
 *
 * =========================================================================
 * 6) SCRIPT CALLS (JAVA SCRIPT API)
 * =========================================================================
 * All functions use: FugsAudio.functionName(...)
 *
 * Core playback:
 *   FugsAudio.play(type, trackId, name, options)
 *     options: { volume, fadein, pan, pitch, persistence, pauseMode, startTime, effect }
 *   FugsAudio.stop(type, trackId, fadeout)
 *   FugsAudio.fade(type, trackId, options)
 *     options: { volume, duration, pan, pitch, curve }
 *   FugsAudio.crossfade(fromType, fromTrackId, toType, toTrackId, name, options)
 *     options: { duration, curve, volume, persistence, pauseMode }
 *
 * Ducking / pump:
 *   FugsAudio.duck(type, trackId, options)     // { level, fadeTime, holdTime, switchId }
 *   FugsAudio.duckAll(options)                // { level, fadeTime, holdTime, type, switchId }
 *   FugsAudio.startPump(options)              // { bpm, depth, shape, tracks }
 *   FugsAudio.stopPump()
 *
 * Proximity:
 *   FugsAudio.setProximity(type, trackId, options)
 *   FugsAudio.clearProximity(type, trackId)
 *
 * Effects:
 *   FugsAudio.setEffect(type, trackId, preset, params)
 *   FugsAudio.fadeInEffect(type, trackId, preset, duration, params)
 *   FugsAudio.fadeOutEffectOnTrack(type, trackId, duration)
 *   FugsAudio.crossfadeEffects(type, trackId, fromPreset, toPreset, duration)
 *   FugsAudio.removeEffect(type, trackId)
 *
 * Pan sweep:
 *   FugsAudio.sweepPan(type, trackId, options)
 *   FugsAudio.stopSweepPan(type, trackId)
 *
 * Sync:
 *   FugsAudio.sync(type, names, volumes)
 *
 * Pause/resume:
 *   FugsAudio.pause(type, trackId, options)   // { fadeout }
 *   FugsAudio.resume(type, trackId, options)  // { volume, fadein }
 *   FugsAudio.pauseAll(); FugsAudio.resumeAll(); FugsAudio.stopAll(fadeout)
 *
 * Snapshots:
 *   FugsAudio.save(name); FugsAudio.load(name)
 *
 * Chains/debug:
 *   FugsAudio.chain(type, trackId, chainString)
 *   FugsAudio.list(type)
 *
 * =========================================================================
 * 7) DEBUGGING (TROUBLESHOOTING + CONSOLE)
 * =========================================================================
 * Audio not playing:
 *   - Check filename spelling (case-sensitive on some platforms)
 *   - Set Debug Logs to Verbose and check console
 *   - Make sure file exists in audio/bgm (or bgs/me/se)
 *
 * Effects not working:
 *   - Load this plugin AFTER other audio plugins
 *   - Check browser console
 *   - Apply effects after the track is playing
 *
 * Proximity not working:
 *   - Event ID must exist on the current map
 *   - Make sure maxDistance isn't 0
 *
 * Tracks stopping unexpectedly:
 *   - persistence defaults to (p:scene) (stops on battle)
 *   - pauseMode defaults to (pause:battle) (pauses in battle)
 *   - Use (p:always) / (pause:never) when you truly mean it
 *
 * -------------------------------------------------------------------------
 * CONSOLE TEST COMMANDS
 * -------------------------------------------------------------------------
 * Open browser console (F8 or F12) and run these commands:
 *
 * TEST RUNNER (Playwright-style):
 *   test()                  // Show help
 *   test('?')               // List all tests
 *   test('?fade')           // Search tests
 *   test('play')            // Basic playback
 *   test('stop')            // Stop with fade
 *   test('fade')            // Volume fade
 *   test('crossfade')       // Crossfade between tracks
 *   test('effect')          // Apply/remove effect
 *   test('listen')          // Quick human listening smoke suite
 *   test('preset')          // All presets
 *   test('preset:cave')     // Single preset by name
 *   test('duck')            // Volume ducking
 *   test('layers')          // Multi-track layering
 *   test('se')              // Sound effects burst
 *   test('save')            // Save state
 *   test('load')            // Load state
 *   test('spatial')         // Spatial audio
 *   test('playall:bgm')     // Play every BGM in folder
 *   test('*')               // Run ALL tests
 *
 * QUICK COMMANDS:
 *   FugsAudio.testCommand('play-bgm1 Battle1 90')  // Test any command
 *   FugsAudio.list()                // Show all active tracks
 *   FugsAudio.stopAll(0)            // Stop everything
 *
 * Optional file logging (for long test output):
 *   TestRunner.fileLogEnabled = true
 *   TestRunner.enableFileLog()      // Writes fugs_test_log.txt
 *   TestRunner.disableFileLog()     // Restore normal console
 *
 * Focus handling: The test runner auto-pauses when the game window loses
 * focus and resumes when it regains it. Fades use requestAnimationFrame
 * which pauses in background tabs — the wait() timer compensates for this.
 *
 * =========================================================================
 * 8) TECHNICAL NOTES + PLANNED FEATURES
 * =========================================================================
 * WebAudio notes:
 *   Uses MV's internal WebAudio implementation (private APIs).
 *   If you see issues: load after other audio plugins, isolate conflicts.
 *
 * Looping:
 *   BGM and BGS loop by default; ME and SE do not loop.
 *
 * Planned:
 *   WAV support (custom loader) and a NW.js popup DAW UI.
 *
 * =========================================================================
 * 9) DETAILED EXAMPLES (COPY/PASTE)
 * =========================================================================
 *
 * =========================================================================
 * STEM MIXING / SYNCHRONIZED PLAYBACK
 * =========================================================================
 *
 * Play multiple audio stems in perfect sync for dynamic mixing.
 * Ideal for layered music where you want to fade instruments in/out.
 *
 * THE PATTERN:
 *   1. Split your song into stems (Drums, Bass, Pads, Lead, etc.)
 *   2. Export each stem as a separate audio file, SAME LENGTH
 *   3. Start all stems together with syncplay (some at 0 volume)
 *   4. Fade layers in/out as needed - they stay in sync because
 *      they're always playing, just silent when faded to 0
 *
 * BASIC USAGE:
 *   syncplay-bgm Drums Bass Pads Lead
 *   // Starts 4 tracks on bgm_1, bgm_2, bgm_3, bgm_4
 *   // First track at 90% volume, rest at 0% (silent but playing)
 *
 * WITH CUSTOM VOLUMES:
 *   syncplay-bgm Drums Bass Pads Lead 90 60 0 0
 *   // Drums at 90%, Bass at 60%, Pads and Lead silent
 *
 * THEN BRING IN LAYERS:
 *   fade-bgm3 70 2                    // Pads fade in over 2s
 *   fade-bgm4 80 4                    // Lead fades in over 4s
 *
 * AND REMOVE LAYERS:
 *   fade-bgm1 0 1                     // Drums fade out (still playing!)
 *   fade-bgm2 0 2                     // Bass fades out
 *
 * IMPORTANT NOTES:
 *   - All stems MUST be the same length for looping to stay in sync
 *   - Don't stop stems - just fade to 0 volume to keep sync
 *   - Use OGG loop tags if your stems need seamless looping
 *   - Track numbers are assigned in order: first stem = bgm_1, etc.
 *
 * EXAMPLE - Battle Music with Intensity Layers:
 *   // Start battle - base rhythm only
 *   syncplay-bgm BattleBase BattleTension BattleClimax 90 0 0
 *
 *   // Enemy gets dangerous - add tension layer
 *   fade-bgm2 70 1
 *
 *   // Boss phase - full intensity
 *   fade-bgm3 90 2
 *
 *   // Victory approaching - drop intensity
 *   fade-bgm3 0 1
 *   fade-bgm2 0 2
 *
 * =========================================================================
 * AUDIO EFFECTS
 * =========================================================================
 *
 * Apply real-time effects to any track.
 *
 * APPLY A PRESET (use preset: prefix to avoid collision with raw effects):
 *   effect-bgm preset:underwater
 *   effect-bgm preset:cave
 *   effect-bgm preset:phone
 *   effect-bgm preset:radio
 *   effect-bgm preset:stormyWeather
 *   effect-bgm preset:swordClash
 *   effect-bgm preset:glitchApocalypse
 *   effect-bgm preset:explosionAftershock
 *   // Shorthand without 'preset:' also works: effect-bgm cave
 *
 * APPLY RAW EFFECT:
 *   effect-bgm reverb 3 0.8           // duration, decay
 *   effect-bgm lowpass 800 2          // frequency, resonance
 *   effect-bgm distortion 30          // amount
 *   effect-bgm bitcrusher 8 0.5       // bits, normfreq
 *
 * FADE EFFECT IN/OUT:
 *   fadeeffect-bgm preset:underwater 3    // Fade in over 3s
 *   fadeouteffect-bgm 2                    // Fade out over 2s
 *
 * CROSSFADE EFFECTS:
 *   crossfadeeffect-bgm preset:cave preset:underwater 4
 *   // Transition from cave to underwater over 4s
 *
 * -------------------------------------------------------------------------
 * SIDECHAIN COMPRESSION
 * -------------------------------------------------------------------------
 *
 * Real sidechain compression using envelope follower analysis. The source
 * track's audio level controls the target track's volume dynamically -
 * industry-standard technique.
 *
 * COMMAND: sidechain-bgm <sourceId> <targetId> [threshold] [ratio] [attack]
 * [release]
 *
 * PARAMETERS:
 *   sourceId   - The track that triggers compression (e.g., kick drum)
 *   targetId   - The track being compressed (e.g., bass)
 *   threshold  - RMS level that triggers compression 0-1 (default: 0.5)
 *   ratio      - Compression ratio (default: 4.0 = 4:1 compression)
 *   attack     - How fast compression engages in seconds (default: 0.01)
 *   release    - How fast compression releases in seconds (default: 0.1)
 *
 * EXAMPLES:
 *   sidechain-bgm kick bass 0.4 6.0 0.005 0.15
 *   // Kick (source) ducks bass (target) with 6:1 ratio, fast attack
 *
 *   sidechain-bgm dialog music 0.3 3.0 0.02 0.2
 *   // Dialog ducks music for clarity
 *
 * STOP SIDECHAIN:
 *   stopsidechain-bgm <sourceId> <targetId>
 *   stopsidechain-bgm kick bass
 *
 * USE CASES:
 *   - Classic "pumping" effect (kick ducking bass/pads)
 *   - Vocal/dialog clarity (ducking music during speech)
 *   - Rhythmic movement in dense mixes
 *
 * TECHNICAL NOTE:
 *   Uses envelope follower with AnalyserNode for RMS calculation,
 *   applying attack/release curves via requestAnimationFrame loop.
 *
 * ---
 *
 * CLEAR EFFECTS:
 *   cleareffect-bgm
 *
 * PRESETS (selected examples):
 *   Full list is the `AudioEffects.presets` object in this file.
 * Environmental: underwater, cave, city, dungeon, forest, space,
 * tavernRoom, mistyForest
 *   Communication: phone, radio, radioDistress
 *   Lo-Fi/Retro:   retro, corrupted, damaged, tapeEcho
 *   Dynamics:      gentle, squashed, broadcast, limiter, bassChamber
 *   Spatial:       scifi, jet, wide, ethereal, dizzy, flangedSpirit
 * Fantasy: shimmer, angelic, nightmare, frozen, memory, eldritchVoid
 *   Character:     tiny, giant, robot, overdrivenLute
 *   Atmospheric:   hauntedHall, cursedChapel, dungeonDepths, ghostWhisper
 *   Misc:          muffled, nextroom, psychotic, stutter, overdrive
 *
 * AVAILABLE EFFECTS:
 *   reverb, delay, lowpass, highpass, bandpass, distortion,
 *   bitcrusher, compressor, chorus, tremolo, vibrato, phaser,
 *   flanger, widener, eq3, ringmod, autopan, overdrive, multitap
 *
 * =========================================================================
 * PROXIMITY AUDIO
 * =========================================================================
 *
 * Make sounds get louder/quieter based on player distance.
 * Great for environmental audio (waterfalls, fires, NPCs).
 *
 * ATTACH TO AN EVENT:
 *   play-bgs1 Waterfall 100
 *   proximity-bgs1 {event:5, maxDistance:10}
 *   // Sound from event #5, fades to silence at 10 tiles away
 *
 * WITH OPTIONS:
 *   proximity-bgs1 {event:5, maxDistance:10, curve:smooth, pan:true}
 *   // Smooth falloff curve, stereo panning based on direction
 *
 * WITH DOPPLER:
 *   proximity-bgs1 {event:5, maxDistance:8, doppler:true}
 *   // Pitch shifts as you move toward/away from source
 *
 * CURVE OPTIONS:
 *   linear      - Constant rate falloff
 *   exponential - Slow start, fast end
 *   logarithmic - Fast start, slow end
 *   smooth      - Eases in and out
 *   sharp       - Stays loud, drops fast at end
 *   gentle      - Soft initial drop
 *
 * CUSTOM CURVE:
 * proximity-bgs1 {event:5, maxDistance:10, curve:custom,
 * points:[0,1,0.5,0.8,1,0]}
 *   // Points are [distance, volume] pairs normalized 0-1
 *
 * =========================================================================
 * SFX ALIAS POOLS (HUMANIZATION)
 * =========================================================================
 *
 * Register groups of similar sounds that play with random variation.
 * Perfect for footsteps, hits, UI clicks - anything repetitive.
 *
 * REGISTER AN ALIAS:
 * registeralias FootstepGrass {pool:[step1,step2,step3], volumeJitter:5,
 * pitchJitter:8}
 *
 * PLAY THE ALIAS:
 *   play-se alias:FootstepGrass
 *
 * Each play picks a random sound from the pool and applies slight
 * random variation to volume and pitch for natural-sounding repetition.
 *
 * OPTIONS:
 *   pool:         Array of filenames (required)
 *   volume:       Base volume (default: 90)
 *   pitch:        Base pitch (default: 100)
 *   pan:          Base pan (default: 0)
 *   volumeJitter: Random volume variance +/- (default: 0)
 *   pitchJitter:  Random pitch variance +/- (default: 0)
 *   panJitter:    Random pan variance +/- (default: 0)
 *   cooldown:     Minimum ms between plays (default: 0)
 *
 * SCRIPT CALL:
 *   FugsAudio.registerAlias('FootstepStone', {
 *     pool: ['stone1', 'stone2', 'stone3'],
 *     volumeJitter: 5,
 *     pitchJitter: 10,
 *     cooldown: 100
 *   });
 *   FugsAudio.playAlias('FootstepStone');
 *
 * MANAGEMENT:
 *   unregisteralias FootstepGrass
 *   listaliases                      // Print all aliases to console
 *
 * =========================================================================
 * RHYTHMIC PUMP / DUCK
 * =========================================================================
 *
 * Beat-synced volume modulation for tension, heartbeats, or EDM effects.
 *
 * START PUMPING:
 *   duckpump 80 0.6 heartbeat bgm
 *   // 80 BPM, 60% depth, heartbeat shape, affects BGM
 *
 * STOP PUMPING:
 *   stoppump
 *
 * PARAMETERS:
 *   bpm:    Beats per minute (default: 120)
 *   depth:  Intensity 0.0-1.0 (default: 0.5)
 *   shape:  sine, square, saw, heartbeat (default: sine)
 *   tracks: bgm, bgs, se, me, all, or specific like bgm1 (default: all)
 *
 * SHAPES:
 *   sine      - Smooth pumping
 *   square    - Hard on/off
 *   saw       - Ramp up from duck
 *   heartbeat - Double pulse (lub-dub)
 *
 * =========================================================================
 * PAN SWEEPS
 * =========================================================================
 *
 * Automatically sweep audio left-right for movement effects.
 *
 * START SWEEP:
 *   pansweep-bgm -100 100 4
 *   // Sweep from full left to full right over 4 seconds, loop forever
 *
 *   pansweep-bgm -100 100 4 2
 *   // Same but only 2 complete cycles
 *
 * STOP SWEEP:
 *   stoppansweep-bgm
 *
 * =========================================================================
 * SWITCH-CONTROLLED AUDIO
 * =========================================================================
 *
 * Arm audio commands to fire when game switches change.
 * Great for area-based audio without complex eventing.
 *
 * ARM A COMMAND:
 *   play-bgm DangerTheme switch:15
 *   // Plays when switch 15 turns ON, stops when it turns OFF
 *
 *   duck-bgm 0.3 1 0 switch:20
 *   // Ducks BGM when switch 20 is ON, restores when OFF
 *
 * Works with any command.
 * switch:ID is opt-in per command.
 * The command gets registered when the event runs.
 * After that, it fires on Game_Switches.setValue changes anywhere.
 * If you never run the event containing the plugin command, nothing is registered.
 *
 * =========================================================================
 * SNAPSHOTS (SAVE/RESTORE)
 * =========================================================================
 *
 * Save the entire audio state and restore it later.
 *
 * MANUAL:
 *   saveall                          // Save as "auto"
 *   saveall mysnapshot               // Save with custom name
 *   loadall                          // Load "auto"
 *   loadall mysnapshot               // Load custom name
 *
 * AUTOMATIC:
 *   - "auto" snapshot is saved before game save
 *   - "auto" snapshot is restored after game load
 *   - Battle transitions use snapshots internally
 *
 * =========================================================================
 * GLOBAL COMMANDS
 * =========================================================================
 *
 * Commands that affect all tracks at once.
 *
 * FADE ALL:
 *   fadeall 50 3                     // All tracks to 50% over 3s
 *   fadeall-bgm 30 2                 // All BGM tracks to 30%
 *
 * STOP ALL:
 *   stopall 2                        // Stop everything with 2s fade
 *   stopall-bgs 1                    // Stop all BGS with 1s fade
 *
 * PAUSE/RESUME ALL:
 *   pauseall
 *   resumeall
 *
 * PITCH BEND ALL:
 *   pitchbendall 80 2                // All tracks to 80% pitch over 2s
 *   pitchbendall-bgm 120 1           // All BGM to 120% pitch
 *
 * DEBUG:
 *   listall                          // Print all tracks to console
 *   listall-bgm                      // Print all BGM tracks
 *   listaliases                      // Print all SFX aliases
 *
 * -------------------------------------------------------------------------
 * ALIAS MANAGEMENT
 * -------------------------------------------------------------------------
 *
 * Commands for managing SFX alias pools:
 *
 *   registeralias <name> {options}   // Create new alias pool
 *   unregisteralias <name>           // Remove an alias pool
 *   listaliases                      // Print all registered aliases
 *
 * Example:
 *   registeralias FootstepGrass {pool:[step1,step2,step3], pitchJitter:8}
 *   play-se alias:FootstepGrass
 *   unregisteralias FootstepGrass
 *
 * =========================================================================
 * COMMAND CHAINS
 * =========================================================================
 *
 * Execute multiple commands in sequence with timing.
 *
 *   chain-bgm fade 50 2; wait 3; fade 90 2; wait 5; stop 2
 *   // Fade to 50%, wait 3s, fade to 90%, wait 5s, stop
 *
 * Useful for scripted audio sequences without multiple events.
 *
 * -------------------------------------------------------------------------
 * PERSISTENCE + PAUSE MODES (battle/map/menu behavior)
 * -------------------------------------------------------------------------
 * Why:
 *   - Keep ambience continuous across rooms.
 *   - Pause in menu without losing the moment.
 *
 * Minimal:
 *   play-bgs1 Forest_Ambience 60 5 (p:scene)
 *   play-bgm1 Exploration 90 2 (pause:menu)
 *
 * Full reference:
 *   Persistence (does the track STOP on transitions?):
 *     none, scene, battle, always
 *   Pause mode (does it auto-PAUSE?):
 *     never, menu, battle, scene
 *
 * Behavior table (existing quick lookup):
 *   Persistence | Pause Mode | Menu      | Battle
 *   ------------|------------|-----------|----------
 *   none        | never      | Continues | Stops
 *   none        | menu       | Pauses    | Stops
 *   none        | battle     | Continues | Pauses
 *   scene       | never      | Continues | Stops
 *   scene       | battle     | Continues | Pauses
 *   battle      | never      | Continues | Continues
 *   battle      | battle     | Continues | Pauses
 *   always      | never      | Continues | Continues
 *   always      | menu       | Pauses    | Continues
 *   always      | battle     | Continues | Pauses
 *
 * Pitfall:
 *   - Overusing (p:always) is how you end up with “forgotten” tracks.
 *
 * =========================================================================
 * SCRIPT CALLS
 * =========================================================================
 *
 * All functions use: FugsAudio.functionName(...)
 *
 * CORE PLAYBACK:
 *   FugsAudio.play(type, trackId, name, options)
 *     // options: { volume, fadein, pan, pitch, persistence,
 *     //   pauseMode, startTime, effect }
 *     FugsAudio.play('bgm', 1, 'Theme', { volume: 80, fadein: 2 })
 *
 *   FugsAudio.stop(type, trackId, fadeout)
 *     FugsAudio.stop('bgm', 1, 2)   // 2 second fadeout
 *
 *   FugsAudio.fade(type, trackId, options)
 *     // options: { volume, duration, pan, pitch, curve }
 *     FugsAudio.fade('bgm', 1, { volume: 50, duration: 3 })
 *
 *   FugsAudio.crossfade(fromType, fromTrackId, toType, toTrackId, name,
 *     options)
 *     // options: { duration, curve, volume, persistence, pauseMode }
 *     FugsAudio.crossfade('bgm', 1, 'bgm', 2, 'NewSong', { duration: 3 })
 *
 * DUCKING:
 *   FugsAudio.duck(type, trackId, options)
 *     // options: { level, fadeTime, holdTime, switchId }
 *     FugsAudio.duck('bgm', 1, { level: 0.3, fadeTime: 1, holdTime: 5 })
 *
 *   FugsAudio.duckAll(options)
 *     // options: { level, fadeTime, holdTime, type, switchId }
 *     FugsAudio.duckAll({ level: 0.3, type: 'bgm' })
 *
 * RHYTHMIC PUMP:
 *   FugsAudio.startPump(options)
 *     // options: { bpm, depth, shape, tracks }
 *     FugsAudio.startPump({ bpm: 80, depth: 0.6, shape: 'heartbeat' })
 *
 *   FugsAudio.stopPump()
 *
 * PROXIMITY AUDIO:
 *   FugsAudio.setProximity(type, trackId, options)
 *     // options: { event, x, y, maxDistance, minVolume, curve, pan,
 *     //   doppler, dopplerScale }
 *     FugsAudio.setProximity('bgs', 1, { event: 5, maxDistance: 10,
 *       pan: true })
 *
 *   FugsAudio.clearProximity(type, trackId)
 *
 * EFFECTS:
 *   FugsAudio.setEffect(type, trackId, preset, params)
 *     FugsAudio.setEffect('bgm', 1, 'underwater')
 *
 *   FugsAudio.fadeInEffect(type, trackId, preset, duration, params)
 *   FugsAudio.fadeOutEffectOnTrack(type, trackId, duration)
 *   FugsAudio.crossfadeEffects(type, trackId, fromPreset, toPreset,
 *     duration)
 *   FugsAudio.removeEffect(type, trackId)
 *
 * PAN SWEEP:
 *   FugsAudio.sweepPan(type, trackId, options)
 *     // options: { minPan, maxPan, duration, loops, curve }
 *     FugsAudio.sweepPan('bgm', 1, { duration: 4, loops: 2 })
 *
 *   FugsAudio.stopSweepPan(type, trackId)
 *
 * SYNC PLAY (STEM MIXING):
 *   FugsAudio.sync(type, names, volumes)
 *     FugsAudio.sync('bgm', ['Drums', 'Bass', 'Lead'], [90, 60, 0])
 *
 * PAUSE/RESUME:
 *   FugsAudio.pause(type, trackId, options)    // options: { fadeout }
 *   FugsAudio.resume(type, trackId, options) // options: { volume, fadein }
 *   FugsAudio.pauseAll()
 *   FugsAudio.resumeAll()
 *   FugsAudio.stopAll(fadeout)
 *
 * STATE MANAGEMENT:
 *   FugsAudio.save(name)      // Save audio state snapshot
 *   FugsAudio.load(name)      // Load audio state snapshot
 *
 * CHAINS:
 *   FugsAudio.chain(type, trackId, chainString)
 *     FugsAudio.chain('bgm', 1, 'fade 50 2; wait 3; fade 90 2')
 *
 * DEBUGGING:
 *   FugsAudio.list(type)      // List all tracks or by type
 *
 * =========================================================================
 * 0) SPEC
 * =========================================================================
 * Version: 2.2
 * Target: RPG Maker MV 1.6.3 (plugin header: @target MV 1.63)
 * File:   js/plugins/FugsMultiTrackAudioEX.js
 * Runtime assumptions: NW.js 0.29+ (Chromium 65 / Node 9.7.1).
 *
 * Full playbook + complete reference:
 *   DEV/sources/plugins/FugsMultiTrackAudioEX.CLAUDE.md
 * Quick preset/effect test sheet:
 *   AUDIO_TESTS.md
 *
 * =========================================================================
 * PLUGIN PACK (load order)
 * =========================================================================
 *   FugsMultiTrackAudioEX   ← Core (required)
 *   FugsAudio0Docs          ← this file (docs only; safe in production builds)
 *   FugsAudio2Effects       ← optional
 *   FugsAudio3Spatial       ← optional
 *   FugsAudio4Dynamics      ← optional
 *   FugsAudio5Switch        ← optional
 *   FugsAudio6Aliases       ← optional
 *   FugsAudio7Compat        ← optional (after OcRam if used)
 *   FugsAudio8Test          ← dev only
 *
 * This plugin has no runtime behavior. It exists so Plugin Manager can show
 * the full playbook. Keep it ON in production builds if you want in-editor help.
 * =========================================================================
 */

(() => {
  // Docs-only plugin: no runtime. Optional log once for load-order debugging.
  if (window.FugsAudio && window.FugsAudio.Logger && typeof window.FugsAudio.Logger.info === "function") {
    // silent by default — Logger.info only at verbose levels
    window.FugsAudio.Logger.info("[FugsAudio0Docs] documentation plugin loaded (no runtime)");
  }
})();
