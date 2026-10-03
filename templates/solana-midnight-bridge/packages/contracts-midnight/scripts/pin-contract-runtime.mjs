#!/usr/bin/env node
// Point the compactc 0.35.0 bridge module at compact-runtime 0.20.0, and nothing
// else at it. Run after every compile (scripts/compile.sh does).
//
// compactc 0.35.0 generates code for compact-runtime 0.20.0: the module starts
// with `checkRuntimeVersion('0.20.0')` and throws on any other runtime. The
// Effectstream engine (midnight-js 5.0.0-beta.6, compact-js 2.5.5-rc.7) depends
// on compact-runtime 0.18.0-rc.1. So the contract module alone resolves 0.20.0,
// through the npm alias `@midnight-ntwrk/compact-runtime-0.20` that this
// package declares, and this script renames the generated module's runtime
// import (index.js and index.d.ts) to that alias. Both runtimes wrap ONE
// onchain-runtime-v4 (4.0.0-rc.3), so ledger values keep their identity across
// the boundary. Proven by 00050 P0 S1 on a local 2.x devnet with the engine's
// own deployMidnightContract (decision E1-a).
//
// It also re-stamps compactc's integrity manifest (compiler/contract-manifest.json)
// for the rewritten files, so the manifest never describes bytes that no longer
// exist.
//
// Idempotent; refuses a module that was not generated for runtime 0.20.0.
// Adapted from acedward/solana-night-market scripts/pin-contract-runtime.mjs @ 10b29b1.
//
// usage: node scripts/pin-contract-runtime.mjs <managed-contract-dir> [...]

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

const FROM = "'@midnight-ntwrk/compact-runtime'";
const TO = "'@midnight-ntwrk/compact-runtime-0.20'";
const VERSION_CHECK = "checkRuntimeVersion('0.20.0')";

const dirs = process.argv.slice(2);
if (dirs.length === 0) {
  console.error('usage: node scripts/pin-contract-runtime.mjs <managed-contract-dir> [...]');
  process.exit(64);
}

for (const dir of dirs) {
  const js = path.join(dir, 'contract', 'index.js');
  const dts = path.join(dir, 'contract', 'index.d.ts');
  if (!existsSync(js)) {
    console.error(`pin-contract-runtime: ${js} does not exist (compile first)`);
    process.exit(66);
  }
  if (!readFileSync(js, 'utf8').includes(VERSION_CHECK)) {
    console.error(`pin-contract-runtime: ${js} was not generated for compact-runtime 0.20.0 (no ${VERSION_CHECK})`);
    process.exit(65);
  }
  for (const file of [js, dts]) {
    if (!existsSync(file)) continue;
    const before = readFileSync(file, 'utf8');
    const after = before.split(`from ${FROM}`).join(`from ${TO}`);
    if (after.includes(`from ${FROM}`) || after.includes(`require(${FROM})`) || after.includes(`import(${FROM})`)) {
      console.error(`pin-contract-runtime: ${file}: an import of ${FROM} survived`);
      process.exit(70);
    }
    if (after !== before) writeFileSync(file, after);
    const n = after.split(`from ${TO}`).length - 1;
    console.error(`pin-contract-runtime: ${path.relative(process.cwd(), file)}: ${n} import(s) of ${TO}`);
  }
  const manifestPath = path.join(dir, 'compiler', 'contract-manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    let restamped = 0;
    for (const name of ['index.js', 'index.d.ts']) {
      const entry = manifest?.contract?.[name];
      const file = path.join(dir, 'contract', name);
      if (!entry || !existsSync(file)) continue;
      const bytes = readFileSync(file);
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (entry.size !== bytes.length || entry.hash !== hash) restamped += 1;
      entry.size = bytes.length;
      entry.hash = hash;
    }
    if (restamped > 0) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.error(
      `pin-contract-runtime: ${path.relative(process.cwd(), manifestPath)}: ${restamped} entr(ies) re-stamped`,
    );
  }
}
