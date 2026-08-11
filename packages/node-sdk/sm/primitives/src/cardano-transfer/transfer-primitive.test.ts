import { expect, test } from "bun:test";
import { parseRawStmInput, toKeyedJsonGrammar } from "@effectstream/concise";
import { CardanoTransferPrimitive } from "../mod.ts";
import { PrimitiveRegistry } from "../../PrimitiveRegistry.ts";
import { transferGrammar } from "./transfer-grammar.ts";

const VERIFICATION_KEY = Uint8Array.from({ length: 32 }, (_, index) => index);
const VERIFICATION_KEY_HEX =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const CREDENTIAL_HASH =
  "491112dd01155c07dab485f71b572e0cae759e2cd38b1c0e97554297";

function makePrimitive(stateMachinePrefix?: string) {
  PrimitiveRegistry.primitives = {};
  return new CardanoTransferPrimitive({
    instanceName: "CardanoTransfer",
    startBlockHeight: 0,
    stateMachinePrefix,
    predicate: { match: { cardano: {} } },
  } as any);
}

function payloadFor(
  vkeys: Uint8Array[] | undefined,
  stateMachinePrefix?: string,
) {
  const witnesses =
    vkeys === undefined
      ? undefined
      : { vkeywitness: vkeys.map((vkey) => ({ vkey })) };
  const tx = {
    hash: new Uint8Array(32),
    outputs: [],
    witnesses,
  };
  const iterator = makePrimitive(stateMachinePrefix).getPayload(
    0 as any,
    {
      output: { payload: { tx } },
    } as any,
  );
  const result = iterator.next().value as any;
  return result.data[0];
}

test("keeps deprecated inputCredentials as raw verification keys", () => {
  const { accountingPayload } = payloadFor([VERIFICATION_KEY]);

  expect(accountingPayload.inputCredentials).toEqual([VERIFICATION_KEY_HEX]);
  expect(accountingPayload.inputCredentials[0]).toMatch(/^[0-9a-f]{64}$/);
});

test("emits Cardano credential hashes as signerKeyHashes", () => {
  const { accountingPayload } = payloadFor([VERIFICATION_KEY]);

  expect(accountingPayload.signerKeyHashes).toEqual([CREDENTIAL_HASH]);
  expect(accountingPayload.signerKeyHashes[0]).toMatch(/^[0-9a-f]{56}$/);
});

test("deduplicates legacy keys and signer hashes in first-seen order", () => {
  const secondVkey = new Uint8Array(32).fill(0xff);
  const { accountingPayload } = payloadFor([
    VERIFICATION_KEY,
    secondVkey,
    VERIFICATION_KEY,
  ]);

  expect(accountingPayload.inputCredentials).toHaveLength(2);
  expect(accountingPayload.inputCredentials[0]).toBe(VERIFICATION_KEY_HEX);
  expect(accountingPayload.signerKeyHashes).toHaveLength(2);
  expect(accountingPayload.signerKeyHashes[0]).toBe(CREDENTIAL_HASH);
  expect(accountingPayload.signerKeyHashes[1]).toMatch(/^[0-9a-f]{56}$/);
});

test("emits empty legacy and signer lists when witnesses are absent", () => {
  const { accountingPayload } = payloadFor(undefined);

  expect(accountingPayload.inputCredentials).toEqual([]);
  expect(accountingPayload.signerKeyHashes).toEqual([]);
});

test("appends signerKeyHashes without shifting legacy STM fields", () => {
  const { stateMachinePayload } = payloadFor(
    [VERIFICATION_KEY],
    "cardano-transfer",
  );

  expect(stateMachinePayload.slice(3, 5)).toEqual([
    JSON.stringify([VERIFICATION_KEY_HEX]),
    "[]",
  ]);
  expect(JSON.parse(stateMachinePayload[5])).toEqual([CREDENTIAL_HASH]);
});

test("defaults signerKeyHashes when parsing historical STM tuples", () => {
  const grammar = { "cardano-transfer": transferGrammar } as const;
  const parsed = parseRawStmInput(
    ["cardano-transfer", "tx-id", "", "[]", "[]"],
    grammar,
    toKeyedJsonGrammar(grammar),
  );

  expect(parsed.data.inputCredentials).toBe("[]");
  expect(parsed.data.outputs).toBe("[]");
  expect(parsed.data.signerKeyHashes).toBe("[]");
});
