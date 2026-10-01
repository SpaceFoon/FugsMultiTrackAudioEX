/**
 * The Sound Garden: one map whose events show off every part of the plugin pack.
 *
 * buildGarden(engine) returns the map JSON (events and all) for "mz" or "mv". The two differ
 * only in how plugin commands and speaker names are stored, so both engines get the same demo.
 */
"use strict";

const { A5, B, FOLK, PROP, IMAGES, tilesetFlags } = require("./art");

const PLUGIN = "FugsMultiTrackAudioEX";
const TROOP_ID = 1; // every new MV/MZ project has troop 1
/** Switches the demo uses (the installer names them in System.json). */
const SWITCHES = { STORM: 11, IN_CAVE: 12, STORY_DUCK: 13, CHIMES: 14 };
const SWITCH_NAMES = {
  [SWITCHES.STORM]: "Garden: storm",
  [SWITCHES.IN_CAVE]: "Garden: in cave",
  [SWITCHES.STORY_DUCK]: "Garden: story duck",
  [SWITCHES.CHIMES]: "Garden: chimes on",
};

// -------------------------------------------------------------------- terrain
// H hedge, . grass, , flowers, = gravel path (region 1: footsteps), o plaza, d deck,
// c cave floor (region 2: cave reverb), # cliff, ~ water
const TERRAIN = [
  "HHHHHHHHHHHHHHHHHHHHHHHHHHH",
  "H..dddddd..,.=.,..~~~~~~..H",
  "H..dddddd....=....~~~~~~..H",
  "H..dddddd....=....~~~~~~..H",
  "H.....=......=..........,.H",
  "H.....=......=.....,,,,...H",
  "H.....=......=.....,,,,...H",
  "H.....=......=............H",
  "H.....=...ooooooo.........H",
  "H.....=...ooooooo.........H",
  "H=========ooooooo========.H",
  "H....=....ooooooo.........H",
  "H....=....ooooooo...dddd..H",
  "H....=.......=......dddd..H",
  "H....=.......=......dddd..H",
  "H####c###....=............H",
  "H#cccccc#....=.......,....H",
  "H#cccccc#....=............H",
  "H#cccccc#....=............H",
  "H########....o............H",
  "HHHHHHHHHHHHHHHHHHHHHHHHHHH",
];
const GROUND_OF = { H: "HEDGE", ".": "GRASS", ",": "FLOWERS", "=": "GRAVEL", o: "PLAZA", d: "DECK", c: "CAVE", "#": "CLIFF", "~": "WATER" };
const REGION_OF = { "=": 1, c: 2 };
const TREES = [[2, 7], [8, 6], [16, 3], [24, 8], [17, 14], [24, 15], [10, 15], [10, 18], [16, 18], [23, 19], [1, 4], [25, 2], [20, 9]];
const DECOR = [
  ["BUSH", 15, 5], ["BUSH", 11, 6], ["BUSH", 18, 11], ["BUSH", 2, 2], ["BUSH", 9, 12], ["BUSH", 25, 12],
  ["BOULDER", 9, 14], ["BOULDER", 7, 12], ["BOULDER", 21, 15],
  ["TUFT", 4, 7], ["TUFT", 9, 3], ["TUFT", 19, 8], ["TUFT", 15, 16], ["TUFT", 22, 4], ["TUFT", 3, 11],
  ["MUSHROOMS", 19, 4], ["MUSHROOMS", 23, 6], ["MUSHROOMS", 6, 18], ["MUSHROOMS", 2, 17],
  ["STALAGMITE", 7, 16], ["STALAGMITE", 2, 16], ["STALAGMITE", 7, 18],
  ["FENCE", 20, 11], ["FENCE", 21, 11], ["FENCE", 22, 11], ["FENCE", 23, 11],
  ["CAVE_ARCH", 5, 15],
];

function terrainData() {
  const w = TERRAIN[0].length, h = TERRAIN.length, data = new Array(w * h * 6).fill(0);
  const at = (x, y, z) => (z * h + y) * w + x;
  TERRAIN.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      data[at(x, y, 0)] = A5(GROUND_OF[ch]);
      data[at(x, y, 5)] = REGION_OF[ch] || 0;
    })
  );
  for (const [x, y] of TREES) {
    data[at(x, y, 2)] = B("TREE_TRUNK");
    data[at(x, y - 1, 3)] = B("TREE_TOP");
  }
  for (const [name, x, y] of DECOR) data[at(x, y, 2)] = B(name);
  return { w, h, data };
}

// --------------------------------------------------------------- event lists
/** Builds an event command list for one engine. */
class Script {
  constructor(engine) {
    this.mz = engine === "mz";
    this.list = [];
    this.indent = 0;
  }
  push(code, parameters) {
    this.list.push({ code, indent: this.indent, parameters });
    return this;
  }
  nested(fn) {
    this.indent++;
    if (fn) fn(this);
    this.push(0, []);
    this.indent--;
  }
  comment(...lines) {
    lines.forEach((l, i) => this.push(i ? 408 : 108, [l]));
    return this;
  }
  /** Show Text. MZ shows the speaker in its name box; MV gets it as a coloured first line. */
  say(speaker, ...lines) {
    if (this.mz) {
      this.push(101, ["", 0, 0, 2, speaker || ""]);
    } else {
      this.push(101, ["", 0, 0, 2]);
      if (speaker) lines = ["\\C[6]" + speaker + "\\C[0]"].concat(lines);
    }
    lines.forEach((l) => this.push(401, [l]));
    return this;
  }
  /** One or more FugsAudio commands, exactly as a user would type them. */
  audio(...commands) {
    if (this.mz) {
      if (commands.length === 1) {
        this.push(357, [PLUGIN, "run", "Run Command", { command: commands[0] }]);
        this.push(657, ["Command = " + commands[0]]);
      } else {
        const text = commands.join("\n");
        this.push(357, [PLUGIN, "runMultiple", "Run Commands (one per line)", { commands: text }]);
        this.push(657, ["Commands = " + JSON.stringify(text)]);
      }
    } else {
      commands.forEach((c) => this.push(356, [c]));
    }
    return this;
  }
  /** Show Choices. branches[i](script) fills choice i; the last choice is also what Cancel picks. */
  choices(labels, branches) {
    this.push(102, [labels, labels.length - 1, 0, 2, 0]);
    labels.forEach((label, i) => {
      this.push(402, [i, label]);
      this.nested(branches[i]);
    });
    this.push(404, []);
    return this;
  }
  ifScript(js, then, otherwise) {
    this.push(111, [12, js]);
    this.nested(then);
    if (otherwise) {
      this.push(411, []);
      this.nested(otherwise);
    }
    this.push(412, []);
    return this;
  }
  ifSwitch(id, on, then, otherwise) {
    this.push(111, [0, id, on ? 0 : 1]);
    this.nested(then);
    if (otherwise) {
      this.push(411, []);
      this.nested(otherwise);
    }
    this.push(412, []);
    return this;
  }
  setSwitch(id, on) {
    return this.push(121, [id, id, on ? 0 : 1]);
  }
  selfSwitch(ch, on) {
    return this.push(123, [ch, on ? 0 : 1]);
  }
  wait(frames) {
    return this.push(230, [frames]);
  }
  tint(tone, frames) {
    return this.push(223, [tone, frames, false]);
  }
  battle(troopId) {
    this.push(301, [0, troopId, true, true]);
    ["601", "602", "603"].forEach((code) => {
      this.push(Number(code), []);
      this.nested();
    });
    return this.push(604, []);
  }
  openSave() {
    return this.push(352, []);
  }
  end() {
    this.push(0, []);
    return this.list;
  }
}

// ------------------------------------------------------------------- events
const CONDITIONS = () => ({
  actorId: 1, actorValid: false, itemId: 1, itemValid: false, selfSwitchCh: "A", selfSwitchValid: false,
  switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false, variableId: 1, variableValid: false, variableValue: 0,
});
function page(o) {
  const conditions = CONDITIONS();
  if (o.self) Object.assign(conditions, { selfSwitchCh: o.self, selfSwitchValid: true });
  if (o.switch) Object.assign(conditions, { switch1Id: o.switch, switch1Valid: true });
  const route = o.route || [];
  return {
    conditions,
    directionFix: !!o.directionFix,
    image: {
      tileId: 0,
      characterName: o.sprite ? o.sprite[0] : "",
      characterIndex: o.sprite ? o.sprite[1] : 0,
      direction: o.direction || 2,
      pattern: o.pattern != null ? o.pattern : 1,
    },
    list: o.list,
    moveFrequency: o.moveFrequency || 3,
    moveRoute: {
      list: route.map((code) => ({ code, indent: null })).concat([{ code: 0, parameters: [] }]),
      repeat: true, skippable: true, wait: false,
    },
    moveSpeed: o.moveSpeed || 3,
    moveType: o.route ? 3 : o.wander ? 1 : 0,
    priorityType: o.priority != null ? o.priority : 1,
    stepAnime: !!o.stepAnime,
    through: !!o.through,
    trigger: o.trigger || 0,
    walkAnime: o.walkAnime !== false,
  };
}
const folk = (k) => [IMAGES.folk, FOLK[k]];
const prop = (k) => [IMAGES.props, PROP[k]];
/** Props keep their pose when talked to (their sheet rows are states, not facing directions). */
const propPage = (o) => page(Object.assign({ directionFix: true }, o));

/** Event ids are fixed because proximity bindings refer to them ({event:N}). */
const ID = {
  INIT: 1, FOOTSTEPS: 2, CAVE_ZONE: 3, GUIDE: 4, CONDUCTOR: 5, WIZARD: 6, CAMPFIRE: 7, STORYTELLER: 8,
  RADIO: 9, RADIO_HOST: 10, BEE: 11, SLIME: 12, CHEST: 13, CRYSTAL: 14, SHRINE: 15, CHIMES: 16, LEVER: 17, MONK: 18,
};
const STEMS = [1, 2, 3, 4];
const STEP_FRAMES = 16; // one tile at the player's normal walking speed
const onStems = (fn) => STEMS.map(fn);

function events(engine) {
  const S = () => new Script(engine);
  const E = {};

  E[ID.INIT] = {
    name: "Garden: start the music", x: 0, y: 0,
    pages: [
      page({
        trigger: 3, // autorun once (self switch A)
        list: S()
          .comment("Runs once when the game starts. Every track below keeps playing",
            "across menus, battles and saves without being restarted.")
          .comment("1) Four stems of one song, started in sync. Only bass + pads are",
            "audible at first; the Conductor fades the others in and out.")
          .audio("syncplay-bgm GardenDrums GardenBass GardenPads GardenLead 0 70 60 0")
          .comment("2) Ambience on its own track, under the music.")
          .audio("play-bgs1 GardenBirds 40 4")
          .comment("3) Sounds that live in the world: volume and pan follow the",
            "distance to an event. The bee also gets doppler as it flies past.")
          .audio(
            "play-bgs2 GardenCampfire 100",
            `proximity-bgs2 {event:${ID.CAMPFIRE}, maxDistance:7, pan:true, curve:smooth}`,
            "play-bgm5 GardenRadio 100",
            "effect-bgm5 preset:radio",
            `proximity-bgm5 {event:${ID.RADIO}, maxDistance:6, pan:true, curve:exponential}`,
            "play-bgs3 GardenBee 100",
            `proximity-bgs3 {event:${ID.BEE}, maxDistance:5, pan:true, doppler:true, dopplerScale:2}`
          )
          .comment("4) Footsteps: three recordings, randomised so they never repeat.")
          .audio("registeralias GardenStep {pool:[GardenStep1,GardenStep2,GardenStep3], volume:55, volumeJitter:10, pitchJitter:12, panJitter:8, cooldown:150}")
          .wait(30)
          .say("Guide",
            "Welcome to the Sound Garden!",
            "Everything you hear is a separate track,",
            "mixed live by Fugs MultiTrack Audio.")
          .say("Guide",
            "Talk to people and touch things to change",
            "the mix. Walk near the campfire, the radio",
            "and the bee, and step into the cave.")
          .selfSwitch("A", true)
          .end(),
      }),
      page({ self: "A", list: S().end() }),
    ],
  };

  E[ID.FOOTSTEPS] = {
    name: "Garden: footsteps on gravel", x: 1, y: 0,
    pages: [
      page({
        trigger: 4, // parallel
        list: S()
          .comment("Gravel tiles are region 1. One step sound per tile while walking on them.")
          .ifScript("$gamePlayer.isMoving() && $gameMap.regionId($gamePlayer.x, $gamePlayer.y) === 1",
            (s) => s.audio("play-se1 alias:GardenStep").wait(STEP_FRAMES),
            (s) => s.wait(2))
          .end(),
      }),
    ],
  };

  E[ID.CAVE_ZONE] = {
    name: "Garden: cave acoustics", x: 2, y: 0,
    pages: [
      page({
        trigger: 4,
        list: S()
          .comment("Cave floor is region 2. Entering it fades a cave reverb onto the",
            "band and swaps birdsong for dripping water; leaving undoes it.")
          .ifScript("$gameMap.regionId($gamePlayer.x, $gamePlayer.y) === 2",
            (s) => s.ifSwitch(SWITCHES.IN_CAVE, false, (t) =>
              t.setSwitch(SWITCHES.IN_CAVE, true).audio(
                ...onStems((n) => `fadeeffect-bgm${n} preset:cave 2`),
                "fade-bgs1 0 2",
                "play-bgs6 GardenCave 70 2"
              )),
            (s) => s.ifSwitch(SWITCHES.IN_CAVE, true, (t) =>
              t.setSwitch(SWITCHES.IN_CAVE, false).audio(
                ...onStems((n) => `fadeouteffect-bgm${n} 2`),
                "fade-bgs1 40 2",
                "stop-bgs6 2"
              )))
          .wait(6)
          .end(),
      }),
    ],
  };

  E[ID.GUIDE] = {
    name: "Guide", x: 12, y: 9,
    pages: [
      page({
        sprite: folk("GUIDE"),
        list: S()
          .say("Guide", "What would you like to know?")
          .choices(["Where do I go?", "What's playing?", "Never mind"], [
            (s) => s
              .say("Guide",
                "North: the Conductor mixes the band and",
                "the Wizard bends it with effects.",
                "The slime up top wants a fight.")
              .say("Guide",
                "West: a campfire and the Storyteller.",
                "Below them, a cave. East: the radio.",
                "South: wind chimes, a storm lever, a shrine."),
            (s) => s
              .audio("listall")
              .say("Guide",
                "I just listed every track in the console.",
                "Press F8 to open it: you'll see 5 BGM and",
                "3 BGS tracks, all playing at once."),
            null,
          ])
          .end(),
      }),
    ],
  };

  E[ID.CONDUCTOR] = {
    name: "Conductor (stems)", x: 5, y: 2,
    pages: [
      page({
        sprite: folk("CONDUCTOR"),
        list: S()
          .comment("The four stems never stop, so they stay in sync. Fading a stem",
            "to 0 mutes it; fading it back up brings it in on the beat.")
          .say("Conductor",
            "My band plays four parts of one song, each",
            "on its own track. How shall we play?")
          .choices(["Just the pads", "Add the groove", "Full band", "Melody solo", "Carry on"], [
            (s) => s.audio("fade-bgm1 0 2", "fade-bgm2 0 2", "fade-bgm3 70 2", "fade-bgm4 0 2"),
            (s) => s.audio("fade-bgm1 85 2", "fade-bgm2 75 2", "fade-bgm3 55 2"),
            (s) => s.audio("fade-bgm1 85 2", "fade-bgm2 75 2", "fade-bgm3 55 2", "fade-bgm4 80 2"),
            (s) => s.audio("fade-bgm1 0 3", "fade-bgm2 0 3", "fade-bgm3 25 3", "fade-bgm4 90 3"),
            null,
          ])
          .end(),
      }),
    ],
  };

  E[ID.WIZARD] = {
    name: "Wizard (effects)", x: 20, y: 5,
    pages: [
      page({
        sprite: folk("WIZARD"),
        list: S()
          .comment("Effect presets fade in on all four stems. The music keeps playing:",
            "the effect is a live Web Audio chain on each track.")
          .say("Wizard", "I can make the band sound like it plays...")
          .choices(["...in a cave", "...underwater", "...on an old tape", "...in a haunted hall", "...as giants", "...normally"], [
            (s) => s.audio(...onStems((n) => `fadeeffect-bgm${n} preset:cave 1.5`)),
            (s) => s.audio(...onStems((n) => `fadeeffect-bgm${n} preset:underwater 1.5`)),
            (s) => s.audio(...onStems((n) => `fadeeffect-bgm${n} preset:tapeEcho 1.5`)),
            (s) => s.audio(...onStems((n) => `fadeeffect-bgm${n} preset:hauntedHall 1.5`)),
            (s) => s.audio(...onStems((n) => `fadeeffect-bgm${n} preset:giant 1.5`)),
            (s) => s.audio(...onStems((n) => `fadeouteffect-bgm${n} 1.5`)),
          ])
          .end(),
      }),
    ],
  };

  E[ID.CAMPFIRE] = {
    name: "Campfire (proximity)", x: 3, y: 13,
    pages: [
      propPage({
        sprite: prop("CAMPFIRE"), stepAnime: true, walkAnime: false, moveSpeed: 4,
        list: S()
          .say("", "The fire crackles. Walk around it: it gets",
            "louder as you approach and moves from ear",
            "to ear as you pass by.")
          .end(),
      }),
    ],
  };

  E[ID.STORYTELLER] = {
    name: "Storyteller (switch duck)", x: 2, y: 12,
    pages: [
      page({
        sprite: folk("STORYTELLER"), direction: 6,
        list: S()
          .comment("Switch-controlled duck: while switch 13 is ON the band is held at",
            "25%; turning it OFF fades it back. Registering again is harmless.")
          .audio(`duckall-bgm 0.25 0.6 0 switch:${SWITCHES.STORY_DUCK}`)
          .setSwitch(SWITCHES.STORY_DUCK, true)
          .say("Storyteller",
            "Hush now, the band will play softly while",
            "I talk, so you can hear every word.")
          .say("Storyteller",
            "Long ago this garden was silent. Then the",
            "Conductor taught each sound to keep its own",
            "track, and nothing ever had to stop again.")
          .setSwitch(SWITCHES.STORY_DUCK, false)
          .end(),
      }),
    ],
  };

  E[ID.RADIO] = {
    name: "Radio (proximity + effect)", x: 21, y: 13,
    pages: [
      propPage({
        sprite: prop("RADIO"), stepAnime: true, walkAnime: false, moveSpeed: 2,
        list: S()
          .say("", "A little radio. Turn the dial?")
          .choices(["AM radio", "Old telephone", "Haunted signal", "Studio quality", "Leave it"], [
            (s) => s.audio("effect-bgm5 preset:radio"),
            (s) => s.audio("effect-bgm5 preset:phone"),
            (s) => s.audio("effect-bgm5 preset:possessedRadio"),
            (s) => s.audio("cleareffect-bgm5"),
            null,
          ])
          .end(),
      }),
    ],
  };

  E[ID.RADIO_HOST] = {
    name: "Radio host (sidechain duck)", x: 22, y: 13,
    pages: [
      page({
        sprite: folk("RADIO_HOST"), direction: 4,
        list: S()
          .comment("duckall-sidechain ducks EVERY track except the ones listed (the radio).")
          .say("Radio host", "Shh, my song is on! Let me turn everything",
            "else down for a few seconds.")
          .audio("duckall-sidechain bgm5 0.15 1 6")
          .end(),
      }),
    ],
  };

  E[ID.BEE] = {
    name: "Bee (doppler)", x: 9, y: 7,
    pages: [
      page({
        sprite: prop("BEE"), stepAnime: true, through: true, priority: 2, moveSpeed: 4, moveFrequency: 5,
        // right x8, down x6, left x8, up x6: a loop around the plaza
        route: [].concat(Array(8).fill(3), Array(6).fill(1), Array(8).fill(2), Array(6).fill(4)),
        list: S()
          .say("", "Bzzz. Its pitch rises as it flies toward you",
            "and drops as it flies away: doppler.")
          .end(),
      }),
    ],
  };

  E[ID.SLIME] = {
    name: "Slime (battle)", x: 13, y: 2,
    pages: [
      page({
        sprite: folk("SLIME"), stepAnime: true,
        list: S()
          .say("Slime", "Blub! Fight me! Your garden band will pause",
            "for the battle and pick up right where it",
            "left off when we're done.")
          .comment("Default (pause:battle): tracks pause for battles and resume after.")
          .battle(TROOP_ID)
          .end(),
      }),
    ],
  };

  E[ID.CHEST] = {
    name: "Chest (ME fanfare)", x: 10, y: 2,
    pages: [
      propPage({
        sprite: prop("CHEST"), direction: 2, pattern: 0,
        list: S()
          .comment("A fanfare on an ME track while the band ducks under it.")
          .audio("duckall-bgm 0.2 0.3 3", "play-me1 GardenFanfare 90")
          .selfSwitch("A", true)
          .say("", "You found a fanfare! The band stepped aside",
            "for it and comes back on its own.")
          .end(),
      }),
      propPage({ self: "A", sprite: prop("CHEST"), direction: 8, pattern: 0, list: S().say("", "It's empty.").end() }),
    ],
  };

  E[ID.CRYSTAL] = {
    name: "Save crystal (snapshots)", x: 16, y: 8,
    pages: [
      propPage({
        sprite: prop("CRYSTAL"), stepAnime: true, walkAnime: false, moveSpeed: 2,
        list: S()
          .say("", "Save here, change the mix, then load: every",
            "track, fade, effect and proximity link comes",
            "back exactly as it was.")
          .openSave()
          .end(),
      }),
    ],
  };

  E[ID.SHRINE] = {
    name: "Shrine (pitch + pump)", x: 13, y: 19,
    pages: [
      propPage({
        sprite: prop("SHRINE"), stepAnime: true, walkAnime: false, moveSpeed: 2,
        list: S()
          .say("", "The shrine hums. Touch a rune?")
          .choices(["Slow time", "Heartbeat", "Restore", "Leave"], [
            (s) => s.audio("pitchbendall-bgm 75 2"),
            (s) => s.audio("duckpump 72 0.7 heartbeat bgm"),
            (s) => s.audio("stoppump", "pitchbendall-bgm 100 2"),
            null,
          ])
          .end(),
      }),
    ],
  };

  E[ID.CHIMES] = {
    name: "Wind chimes (pan sweep)", x: 18, y: 17,
    pages: [
      propPage({
        sprite: prop("CHIMES"), stepAnime: true, walkAnime: false, moveSpeed: 3,
        list: S()
          .ifSwitch(SWITCHES.CHIMES, false,
            (s) => s
              .audio("play-bgs4 GardenChimes 80 2", "pansweep-bgs4 -100 100 6")
              .setSwitch(SWITCHES.CHIMES, true)
              .say("", "The wind picks up. The chimes sweep from",
                "your left ear to your right and back."),
            (s) => s
              .audio("stoppansweep-bgs4", "stop-bgs4 2")
              .setSwitch(SWITCHES.CHIMES, false)
              .say("", "The wind settles."))
          .end(),
      }),
    ],
  };

  E[ID.LEVER] = {
    name: "Storm lever (switch:N)", x: 22, y: 17,
    pages: [
      propPage({
        sprite: prop("LEVER"), direction: 2,
        list: S()
          .comment("switch:11 arms the rain: it starts whenever switch 11 turns ON",
            "and stops when it turns OFF, from any event or script.")
          .audio(`play-bgs5 GardenRain 80 3 switch:${SWITCHES.STORM}`, "fade-bgs1 10 3")
          .tint([-68, -68, -34, 68], 60)
          .setSwitch(SWITCHES.STORM, true)
          .say("", "You pull the lever. Storm clouds roll in.")
          .end(),
      }),
      propPage({
        switch: SWITCHES.STORM, sprite: prop("LEVER"), direction: 8,
        list: S()
          .audio("fade-bgs5 0 2", "fade-bgs1 40 3")
          .tint([0, 0, 0, 0], 60)
          .wait(120)
          .setSwitch(SWITCHES.STORM, false)
          .say("", "The rain stops.")
          .end(),
      }),
    ],
  };

  E[ID.MONK] = {
    name: "Monk (cave)", x: 3, y: 18,
    pages: [
      page({
        sprite: folk("MONK"), direction: 6,
        list: S()
          .say("Monk", "Listen. When you stepped in here, the band",
            "took on the cave's echo, and it will let go",
            "of it when you step out.")
          .end(),
      }),
    ],
  };

  return Object.keys(E).map(Number).sort((a, b) => a - b).map((id) => Object.assign({ id, note: "" }, E[id]));
}

function buildGarden(engine) {
  if (engine !== "mz" && engine !== "mv") throw new Error("engine must be 'mz' or 'mv'");
  const t = terrainData();
  const list = events(engine);
  const evs = [null];
  for (const e of list) evs[e.id] = e;
  return {
    autoplayBgm: false, autoplayBgs: false, battleback1Name: "", battleback2Name: "",
    bgm: { name: "", pan: 0, pitch: 100, volume: 90 }, bgs: { name: "", pan: 0, pitch: 100, volume: 90 },
    disableDashing: false, displayName: "Sound Garden", encounterList: [], encounterStep: 30,
    height: t.h, note: "Fugs MultiTrack Audio EX demo", parallaxLoopX: false, parallaxLoopY: false,
    parallaxName: "", parallaxShow: true, parallaxSx: 0, parallaxSy: 0, scrollType: 0,
    specifyBattleback: false, tilesetId: 0, // set by the installer
    width: t.w, data: t.data, events: evs,
  };
}

/** The Tilesets.json entry (id filled in by the installer). */
function gardenTileset() {
  return {
    id: 0, flags: tilesetFlags(), mode: 1, name: "Fugs Sound Garden", note: "",
    tilesetNames: ["", "", "", "", IMAGES.tilesetA5, IMAGES.tilesetB, "", "", ""],
  };
}

const START = { x: 13, y: 11, direction: 8 };

module.exports = { buildGarden, gardenTileset, SWITCHES, SWITCH_NAMES, START, ID, TERRAIN, PLUGIN };
