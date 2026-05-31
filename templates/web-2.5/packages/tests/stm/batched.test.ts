import { assertSQL, assert } from "../helpers.ts";
import { privateKeyToAccount } from "viem/accounts";
import { createMessageForBatcher } from "@effectstream/concise";
import { AddressType } from "@effectstream/utils";
import type { Client } from "pg";

// The web2.5 path: an off-chain server submits a GASLESS input on behalf of a
// user through the batcher's /send-input endpoint. The batcher pays gas. This
// mirrors packages/batcher/post-batcher.ts (the modern port of v1's
// post-batcher.mjs). We sign with Hardhat account #1 so the resulting DB row is
// distinct from the direct-path account #0 rows.
const BATCHER_URL = "http://localhost:3334";
const NAMESPACE = "web-2.5"; // must equal the batcher's namespace
const ADDRESS_TYPE_EVM = AddressType.EVM; // 0

// Hardhat well-known account #1 — the user the server credits XP to.
const userAccount = privateKeyToAccount(
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
);

const BATCHED_XP = 3; // calculateProgress(0, 3) = 30

export async function batchedGainExperienceTest(db: Client): Promise<void> {
  const address = userAccount.address.toLowerCase();
  const input = JSON.stringify(["gainedExperience", BATCHED_XP]);
  const timestamp = Date.now().toString();

  const message = createMessageForBatcher(
    NAMESPACE,
    timestamp,
    address,
    ADDRESS_TYPE_EVM,
    input,
    undefined,
  );
  const signature = await userAccount.signMessage({ message });

  const before = await db.query(
    `SELECT experience FROM users WHERE wallet = '${address}'`,
  );
  const beforeXp = Number(before.rows[0]?.experience ?? 0);

  const res = await fetch(`${BATCHER_URL}/send-input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data: { address, addressType: ADDRESS_TYPE_EVM, input, signature, timestamp },
      confirmationLevel: "wait-receipt",
    }),
  });
  const body = await res.json();

  await assert(
    "batched gainExperience: batcher accepted the signed /send-input (web2.5 path)",
    async () => res.ok && body.success === true,
  );

  await assertSQL(
    `batched gainExperience: users.experience for the batched user grows by ${BATCHED_XP * 10}`,
    db,
    `SELECT experience FROM users WHERE wallet = '${address}'`,
    (r) => Number((r.rows[0] as any)?.experience ?? 0) >= beforeXp + BATCHED_XP * 10,
    (r) => Number((r.rows[0] as any).experience) === beforeXp + BATCHED_XP * 10,
    60_000,
  );
}
