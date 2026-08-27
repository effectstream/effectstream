#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const EXPECTED_REMAINDER_SHA256 =
  "efbac83e2f9868d116d044d9b52a9db222aca4e73862876489e6df15cd704744";
const NOTICE_LINK = "docs/maintenance/midnight-1.md";
const ORIGINAL_TITLE = "# Effectstream";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

const repositoryRoot = resolve(import.meta.dir, "..");
const readme = readFileSync(resolve(repositoryRoot, "README.md"), "utf8");
const firstNonBlank = readme.split(/\r?\n/).find((line) => line.trim() !== "");
assert(firstNonBlank === "> [!WARNING]", "README first non-blank content must be the GitHub WARNING callout");

const originalTitleOffset = readme.indexOf(ORIGINAL_TITLE);
assert(originalTitleOffset > 0, "original README title must follow the maintenance notice");
const notice = readme.slice(0, originalTitleOffset);
const originalRemainder = readme.slice(originalTitleOffset);
const normalizedNotice = notice
  .replace(/^>\s?/gm, "")
  .replaceAll("`", "")
  .replace(/\s+/g, " ");

for (const requiredText of [
  "midnight-1, the temporary Midnight Node 1.x / Ledger-v8 maintenance line",
  "default v-next branch targets Midnight Node 2.x / Ledger-v9",
  "Stable npm 0.104.x releases are available only under dist-tag midnight-1",
  "stable 0.200.x remains latest",
  "reviewed cherry-picks or Node-1-specific manual ports",
  "never merges the Node-2 migration",
]) {
  assert(normalizedNotice.includes(requiredText), `README maintenance notice is missing: ${requiredText}`);
}

assert(
  notice.includes(`](${NOTICE_LINK})`),
  `README maintenance notice must link ${NOTICE_LINK}`,
);
assert(
  /installation, backport policy, support, and EOL details/.test(normalizedNotice),
  "README maintenance link description must cover install, backport, support, and EOL",
);
assert(existsSync(resolve(repositoryRoot, NOTICE_LINK)), `linked maintenance file does not exist: ${NOTICE_LINK}`);

const remainderHash = sha256(originalRemainder);
assert(
  remainderHash === EXPECTED_REMAINDER_SHA256,
  `preexisting README remainder changed: expected ${EXPECTED_REMAINDER_SHA256}, got ${remainderHash}`,
);

const vNextReadmeFlag = process.argv.indexOf("--v-next-readme");
if (vNextReadmeFlag !== -1) {
  const vNextReadmePath = process.argv[vNextReadmeFlag + 1];
  assert(vNextReadmePath, "--v-next-readme requires a file path");
  const refFlag = process.argv.indexOf("--v-next-ref");
  const ref = refFlag === -1 ? "v-next" : process.argv[refFlag + 1];
  assert(ref, "--v-next-ref requires a ref label");
  const defaultLineReadme = readFileSync(vNextReadmePath, "utf8");
  assert(!defaultLineReadme.includes(NOTICE_LINK), `${ref} unexpectedly contains the maintenance-ledger link`);
  assert(
    !defaultLineReadme.includes("the temporary Midnight Node 1.x / Ledger-v8 maintenance line"),
    `${ref} unexpectedly contains the midnight-1 branch warning`,
  );
  console.log(`v-next-ref=${ref}`);
}

console.log(`first-content=${firstNonBlank}`);
console.log(`maintenance-link=${NOTICE_LINK}`);
console.log(`remainder-sha256=${remainderHash}`);
