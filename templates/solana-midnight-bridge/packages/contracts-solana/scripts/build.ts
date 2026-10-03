#!/usr/bin/env bun
// Orchestrator build step: makes sure build/bridge.so exists before the
// validator preloads it.
//
// SKIP_SOLANA_BUILD=1 (the default from start.dev.ts) reuses the committed
// build/bridge.so and compiles only when it is absent; SKIP_SOLANA_BUILD=0
// forces a native rebuild (see build-program.ts for the toolchain caveats).
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { LOCAL_BRIDGE_PROGRAM_ID } from "../program-id.ts";

const PKG_DIR = import.meta.dirname!;
const ROOT = path.resolve(PKG_DIR, "..");
const PROGRAM_SO = path.join(ROOT, "build", "bridge.so");

if (process.env.SKIP_SOLANA_BUILD === "1" && fs.existsSync(PROGRAM_SO)) {
  console.log(`[contracts-solana] SKIP_SOLANA_BUILD=1 — reusing ${path.relative(ROOT, PROGRAM_SO)}`);
} else {
  if (process.env.SKIP_SOLANA_BUILD === "1") {
    console.log("[contracts-solana] SKIP_SOLANA_BUILD=1 but build/bridge.so is absent — compiling");
  }
  const result = spawnSync(process.execPath, [path.join(PKG_DIR, "build-program.ts")], {
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(typeof result.status === "number" ? result.status : 1);
}

if (!fs.existsSync(PROGRAM_SO)) {
  console.error("[contracts-solana] build/bridge.so is missing after the build step");
  process.exit(1);
}
const so = fs.readFileSync(PROGRAM_SO);
console.log(`[contracts-solana] local program id: ${LOCAL_BRIDGE_PROGRAM_ID}`);
console.log(
  `[contracts-solana] ${path.relative(ROOT, PROGRAM_SO)}: ${so.length} B, sha256 ${createHash("sha256").update(so).digest("hex")}`,
);
