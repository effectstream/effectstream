// Drift guard for the wallet helpers that necessarily exist twice.
//
// `e2e/multi-batcher/wallet.ts` and `templates/multi-batcher/shared/wallet.ts`
// are the same file. They cannot be one file: templates ship standalone and
// must not import out of the repo, and e2e must not import out of `e2e/`.
//
// That duplication has already cost real time. The clean-websocket-close guard
// was added to the e2e copy while debugging CI and never reached the template
// copy, leaving six template processes exposed to the exact crash it fixes —
// and the deep suite could not catch it because the crash only fires during
// wallet teardown. A genesis-sync gate went missing the same way earlier.
//
// So: the two copies must stay byte-identical. Anything that genuinely differs
// between the two environments (ports, seeds, URLs) belongs in `env.ts`, which
// is deliberately NOT covered here.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");

/** Pairs that must not drift: [canonical, copy]. */
const MIRRORED: { a: string; b: string }[] = [
  {
    a: "e2e/multi-batcher/wallet.ts",
    b: "templates/multi-batcher/shared/wallet.ts",
  },
];

export interface DriftReport {
  checked: number;
  problems: string[];
}

export function checkMirroredFiles(): DriftReport {
  const problems: string[] = [];
  let checked = 0;

  for (const { a, b } of MIRRORED) {
    let textA: string;
    let textB: string;
    try {
      textA = readFileSync(join(REPO, a), "utf8");
      textB = readFileSync(join(REPO, b), "utf8");
    } catch (e) {
      // A moved or renamed file must fail loudly. Silently "finding no drift"
      // because neither file could be read is the failure mode this guards.
      problems.push(
        `could not read the pair (${a} ↔ ${b}): ${e instanceof Error ? e.message : String(e)}`,
      );
      continue;
    }

    // Non-empty corpus: a pair of empty files would compare equal and prove
    // nothing.
    if (textA.trim().length < 500 || textB.trim().length < 500) {
      problems.push(`${a} / ${b}: suspiciously small — is this still the real file?`);
      continue;
    }

    checked++;
    if (textA === textB) continue;

    const linesA = textA.split("\n");
    const linesB = textB.split("\n");
    const sample: string[] = [];
    for (let i = 0; i < Math.max(linesA.length, linesB.length) && sample.length < 6; i++) {
      if (linesA[i] !== linesB[i]) {
        sample.push(`    line ${i + 1}:`);
        sample.push(`      ${a}: ${linesA[i] === undefined ? "<eof>" : linesA[i].trim()}`);
        sample.push(`      ${b}: ${linesB[i] === undefined ? "<eof>" : linesB[i].trim()}`);
      }
    }
    problems.push(
      `${a} and ${b} have drifted apart.\n` +
        `    They must stay byte-identical — fix one, copy it to the other.\n` +
        `    Environment-specific values belong in env.ts, not here.\n` +
        sample.join("\n"),
    );
  }

  return { checked, problems };
}

/** Throws with a readable report if anything drifted. */
export function assertNoDrift(): void {
  const { checked, problems } = checkMirroredFiles();
  if (problems.length > 0) {
    throw new Error("mirrored-file drift detected:\n  " + problems.join("\n  "));
  }
  if (checked !== MIRRORED.length) {
    throw new Error(
      `drift check verified ${checked}/${MIRRORED.length} pairs — the rest could not be compared`,
    );
  }
}

if (import.meta.main) {
  try {
    assertNoDrift();
    console.log(`[drift] ok — ${MIRRORED.length} mirrored pair(s) identical`);
    process.exit(0);
  } catch (e) {
    console.error(`[drift] ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
