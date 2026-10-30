/**
 * Entry point of the repo's Docker image (see Dockerfile).
 *
 *   verify                 run scripts/verify-all.js (extra args are passed through, e.g. --fast)
 *   release <version>      run the full gate, then build the release zip into /out (or ./release)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const [command = "verify", ...rest] = process.argv.slice(2);

function node(script, args) {
  const r = spawnSync(process.execPath, [path.join("scripts", script)].concat(args || []), {
    cwd: root,
    stdio: "inherit",
  });
  return r.status === null ? 1 : r.status;
}

if (command === "verify") {
  process.exit(node("verify-all.js", rest));
} else if (command === "release") {
  if (!rest[0]) {
    console.error("usage: release <version>   e.g. release 2.3.0");
    process.exit(2);
  }
  const verified = node("verify-all.js");
  if (verified !== 0) {
    console.error("Not packaging: the verification gate failed.");
    process.exit(verified);
  }
  const out = fs.existsSync("/out") ? "/out" : path.join(root, "release");
  process.exit(node("package-release.js", [rest[0], "--out", out]));
} else {
  console.error(`Unknown command "${command}". Use: verify [--fast] | release <version>`);
  process.exit(2);
}
