/**
 * Guard for RPG Maker MV 1.6.x: NW.js 0.29 = Chromium 65 / V8 6.5.
 *
 * The plugin pack must load and run there, so plugin code (not the Node-side test
 * harness) may not use syntax or built-ins newer than Chromium 65. Node 22, which runs
 * the tests, would happily accept them, so nothing else catches a regression.
 *
 * Usage:  node scripts/check-mv-compat.js            (checks all plugin files + the bundle)
 *         node scripts/check-mv-compat.js --self-test
 *
 * The scanner blanks out comments, string/template text and regex literals first, so words in
 * documentation or messages can never trigger it.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const SYNTAX = [
  [/\?\.(?!\d)/, "optional chaining ?. (Chrome 80)"],
  [/\?\?/, "nullish coalescing ?? (Chrome 80)"],
  [/\bcatch\s*\{/, "optional catch binding (Chrome 66)"],
  [/\d_\d/, "numeric separator (Chrome 75)"],
  [/\b\d+n\b/, "BigInt literal (Chrome 67)"],
  [/(?:\?\?|\|\||&&)=/, "logical assignment (Chrome 85)"],
  [/(^|[^\w$"'`\\])#[A-Za-z_]/, "private class member (Chrome 74)"],
  [/\bstatic\s*\{/, "class static block (Chrome 94)"],
  [/\bawait\b(?![^\n]*\bfunction\b)(?<!async[^\n]*)/, null], // placeholder, filtered below
];
SYNTAX.pop();

const API = [
  [/\.flat\s*\(/, "Array.prototype.flat (Chrome 69)"],
  [/\.flatMap\s*\(/, "Array.prototype.flatMap (Chrome 69)"],
  [/Object\.fromEntries/, "Object.fromEntries (Chrome 73)"],
  [/\.trimStart\s*\(|\.trimEnd\s*\(/, "String.prototype.trimStart/trimEnd (Chrome 66)"],
  [/\.matchAll\s*\(/, "String.prototype.matchAll (Chrome 73)"],
  [/\bglobalThis\b/, "globalThis (Chrome 71)"],
  [/\.replaceAll\s*\(/, "String.prototype.replaceAll (Chrome 85)"],
  [/\.at\s*\(\s*-?\d/, "Array/String.prototype.at (Chrome 92)"],
  [/\bstructuredClone\b/, "structuredClone (Chrome 98)"],
  [/Object\.hasOwn\s*\(/, "Object.hasOwn (Chrome 93)"],
  [/\bqueueMicrotask\b/, "queueMicrotask (Chrome 71)"],
  [/\bBigInt\b/, "BigInt (Chrome 67)"],
  [/\.findLast(Index)?\s*\(/, "Array.prototype.findLast (Chrome 97)"],
  [/Promise\.(allSettled|any)\b/, "Promise.allSettled/any (Chrome 76/85)"],
  [/\bAudioWorklet\b/, "AudioWorklet (Chrome 66)"],
  [/\bAbortController\b/, "AbortController (Chrome 66)"],
  [/\.toSorted\s*\(|\.toReversed\s*\(/, "change-array-by-copy (Chrome 110)"],
  [/\bIntl\.(ListFormat|Segmenter|DisplayNames)/, "Intl.* newer than Chrome 65"],
];

/** Replace comments, string/template text and regex literals with spaces (newlines kept). */
function stripNonCode(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  const templateStack = []; // brace depths at which a `${` opened
  let braceDepth = 0;
  let lastSig = ""; // last significant (non-space) code char, for regex-vs-divide decisions
  let lastWord = "";

  const blank = (s) => s.replace(/[^\n]/g, " ");

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];

    if (c === "/" && d === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? n : end;
      out += blank(src.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") {
        if (src[j] === "\\") j++;
        j++;
      }
      out += c + blank(src.slice(i + 1, j)) + (src[j] === c ? c : "");
      i = j + 1;
      lastSig = c;
      lastWord = "";
      continue;
    }
    if (c === "`") {
      // template text up to the next unescaped ` or ${
      let j = i + 1;
      while (j < n && src[j] !== "`" && !(src[j] === "$" && src[j + 1] === "{")) {
        if (src[j] === "\\") j++;
        j++;
      }
      out += "`" + blank(src.slice(i + 1, j));
      if (src[j] === "$") {
        out += "${";
        templateStack.push(braceDepth);
        braceDepth++;
        i = j + 2;
      } else {
        out += "`";
        i = j + 1;
      }
      lastSig = "`";
      lastWord = "";
      continue;
    }
    if (c === "{") {
      braceDepth++;
    } else if (c === "}") {
      braceDepth--;
      if (templateStack.length && templateStack[templateStack.length - 1] === braceDepth) {
        // end of a ${ ... } expression: resume template text
        templateStack.pop();
        out += "}";
        let j = i + 1;
        while (j < n && src[j] !== "`" && !(src[j] === "$" && src[j + 1] === "{")) {
          if (src[j] === "\\") j++;
          j++;
        }
        out += blank(src.slice(i + 1, j));
        if (src[j] === "$") {
          out += "${";
          templateStack.push(braceDepth);
          braceDepth++;
          i = j + 2;
        } else {
          out += "`";
          i = j + 1;
        }
        lastSig = "`";
        continue;
      }
    }
    if (c === "/") {
      const regexAllowed =
        lastSig === "" || "(,=:[!&|?{};+-*%<>~^".includes(lastSig) || /^(return|typeof|case|in|of|delete|void|throw|new)$/.test(lastWord);
      if (regexAllowed) {
        let j = i + 1;
        let inClass = false;
        while (j < n && src[j] !== "\n") {
          if (src[j] === "\\") {
            j += 2;
            continue;
          }
          if (src[j] === "[") inClass = true;
          else if (src[j] === "]") inClass = false;
          else if (src[j] === "/" && !inClass) break;
          j++;
        }
        if (src[j] === "/") {
          j++;
          while (j < n && /[a-z]/i.test(src[j])) j++;
          out += "/" + blank(src.slice(i + 1, j)) ;
          i = j;
          lastSig = "/";
          lastWord = "";
          continue;
        }
      }
    }

    out += c;
    if (!/\s/.test(c)) {
      lastSig = c;
      if (/[A-Za-z_$]/.test(c)) lastWord = (/[A-Za-z0-9_$]/.test(lastSig) && /[A-Za-z0-9_$]$/.test(out.slice(0, -1)) ? lastWord : "") + c;
      else lastWord = "";
    }
    i++;
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function scanSource(name, src) {
  const code = stripNonCode(src);
  const problems = [];
  for (const [re, what] of SYNTAX.concat(API)) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m;
    while ((m = g.exec(code))) {
      problems.push(`${name}:${lineOf(code, m.index)}  ${what}`);
      if (m.index === g.lastIndex) g.lastIndex++;
    }
  }
  return problems;
}

function selfTest() {
  const bad = [
    "const a = obj?.b;",
    "const a = x ?? 1;",
    "try { f(); } catch { g(); }",
    "const n = 1_000;",
    "const big = 10n;",
    "arr.flat();",
    "Object.fromEntries(x);",
    "s.trimStart();",
    "globalThis.x = 1;",
    "str.replaceAll('a','b');",
    "a ||= b;",
  ];
  const good = [
    "// obj?.b and x ?? y and arr.flat() in a comment",
    "const s = 'obj?.b and x ?? y'; const t = `a ?? ${1 + 1} b?.c`;",
    "const re = /a?.b??c/g; const q = a ? .5 : 1;",
    "const x = cond ? 0.5 : y; /* .flat( */ f(/[?]./);",
    "try { f(); } catch (e) { g(); }",
    "const o = { a: 1 }; o.hasOwnProperty('a');",
  ];
  let failed = 0;
  for (const s of bad) {
    if (scanSource("bad", s).length === 0) {
      failed++;
      console.error("self-test: should have flagged: " + s);
    }
  }
  for (const s of good) {
    const p = scanSource("good", s);
    if (p.length) {
      failed++;
      console.error("self-test: false positive on: " + s + "\n  " + p.join("\n  "));
    }
  }
  if (failed) process.exit(1);
  console.log("check-mv-compat self-test OK (" + bad.length + " must-flag, " + good.length + " must-pass)");
}

function main() {
  if (process.argv.includes("--self-test")) return selfTest();
  const files = fs
    .readdirSync(root)
    .filter((f) => /^Fugs.*\.js$/.test(f))
    .map((f) => path.join(root, f));
  const bundle = path.join(root, "dist", "FugsMultiTrackAudioEX.bundle.js");
  if (fs.existsSync(bundle)) files.push(bundle);

  let problems = [];
  for (const f of files) {
    problems = problems.concat(scanSource(path.relative(root, f), fs.readFileSync(f, "utf8")));
  }
  if (problems.length) {
    console.error("Code newer than NW.js 0.29 / Chromium 65 (RPG Maker MV 1.6.x) found:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  console.log("MV 1.6 (Chromium 65) compatibility OK: " + files.length + " plugin files scanned");
}

main();
