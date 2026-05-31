/**
 * Modern port of the paima-engine-v1 `post-batcher.mjs`.
 *
 * The web2.5 value prop: an off-chain game server submits a gasless input on
 * behalf of a user, AFTER verifying server-side that the user met whatever
 * conditions earn experience. The batcher pays gas and the user never signs a
 * chain transaction.
 *
 * v1 posted to a custom `/submit_self_signed_input` endpoint guarded by an API
 * key. The modern batcher exposes a single write endpoint, `POST /send-input`,
 * and verifies an EVM signature against its configured `namespace`. So the
 * server now: (1) builds the concise input `["gainedExperience", xp]`,
 * (2) signs `namespace + target + timestamp + address + input` with the
 * server's own (gas-payer) key, (3) POSTs the wrapped body to /send-input.
 *
 * Usage:
 *   bun run packages/batcher/post-batcher.ts <xpGain>
 *   bun run packages/batcher/post-batcher.ts 10
 */
import { privateKeyToAccount } from "viem/accounts";
import { createMessageForBatcher } from "@effectstream/concise";
import { AddressType } from "@effectstream/utils";

const BATCHER_URL = process.env.BATCHER_URL ?? "http://localhost:3334";
const NAMESPACE = process.env.BATCHER_NAMESPACE ?? "web-2.5";
// Server / gas-payer key. In dev this is Hardhat account #1 (the batcher's key).
const SERVER_PRIVATE_KEY =
  (process.env.EVM_PRIVATE_KEY as `0x${string}`) ??
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

// @effectstream/utils AddressType.EVM === 0.
const ADDRESS_TYPE_EVM = AddressType.EVM;

export async function postGainedExperience(xpGain: number): Promise<unknown> {
  const account = privateKeyToAccount(SERVER_PRIVATE_KEY);
  const address = account.address.toLowerCase();
  const input = JSON.stringify(["gainedExperience", xpGain]);
  const timestamp = Date.now().toString();

  const message = createMessageForBatcher(
    NAMESPACE,
    timestamp,
    address,
    ADDRESS_TYPE_EVM,
    input,
    undefined,
  );
  const signature = await account.signMessage({ message });

  const res = await fetch(`${BATCHER_URL}/send-input`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      data: {
        address,
        addressType: ADDRESS_TYPE_EVM,
        input,
        signature,
        timestamp,
      },
      confirmationLevel: "wait-effectstream-processed",
    }),
  });

  const response = await res.json();
  if (!response.success) {
    console.error(`Batcher rejected input: ${response.message ?? JSON.stringify(response)}`);
  }
  return response;
}

if (import.meta.main) {
  const xpGain = Number(process.argv[2]);
  if (!Number.isFinite(xpGain) || xpGain < 1) {
    console.error("Usage: bun run packages/batcher/post-batcher.ts <xpGain>  (e.g. 10)");
    process.exit(1);
  }
  const response = await postGainedExperience(xpGain);
  console.log({ response });
}
