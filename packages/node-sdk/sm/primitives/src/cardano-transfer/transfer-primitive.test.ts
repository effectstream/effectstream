import { expect, test } from "bun:test";
import { CardanoTransferPrimitive } from "../mod.ts";
import { PrimitiveRegistry } from "../../PrimitiveRegistry.ts";

const VERIFICATION_KEY = Uint8Array.from({ length: 32 }, (_, index) => index);
const CREDENTIAL_HASH =
  "491112dd01155c07dab485f71b572e0cae759e2cd38b1c0e97554297";

function makePrimitive() {
  PrimitiveRegistry.primitives = {};
  return new CardanoTransferPrimitive({
    instanceName: "CardanoTransfer",
    startBlockHeight: 0,
    stateMachinePrefix: undefined,
    predicate: { match: { cardano: {} } },
  } as any);
}

function inputCredentialsFor(vkeys: Uint8Array[] | undefined): string[] {
  const witnesses =
    vkeys === undefined
      ? undefined
      : { vkeywitness: vkeys.map((vkey) => ({ vkey })) };
  const tx = {
    hash: new Uint8Array(32),
    outputs: [],
    witnesses,
  };
  const iterator = makePrimitive().getPayload(
    0 as any,
    {
      output: { payload: { tx } },
    } as any,
  );
  const result = iterator.next().value as any;
  return result.data[0].accountingPayload.inputCredentials;
}

test("hashes witness verification keys into Cardano input credentials", () => {
  const credentials = inputCredentialsFor([VERIFICATION_KEY]);

  expect(credentials).toEqual([CREDENTIAL_HASH]);
  expect(credentials[0]).toMatch(/^[0-9a-f]{56}$/);
});

test("deduplicates input credentials in first-seen order", () => {
  const secondVkey = new Uint8Array(32).fill(0xff);
  const credentials = inputCredentialsFor([
    VERIFICATION_KEY,
    secondVkey,
    VERIFICATION_KEY,
  ]);

  expect(credentials).toHaveLength(2);
  expect(credentials[0]).toBe(CREDENTIAL_HASH);
  expect(credentials[1]).toMatch(/^[0-9a-f]{56}$/);
});

test("emits an empty credential list when witnesses are absent", () => {
  expect(inputCredentialsFor(undefined)).toEqual([]);
});
