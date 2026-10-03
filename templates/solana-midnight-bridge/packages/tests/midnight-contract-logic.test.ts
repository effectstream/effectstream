// Native tests of the bridge contract's circuit LOGIC, with no chain and no
// proofs: the compiled module runs each circuit locally on the contract's own
// runtime (compact-runtime 0.20), exactly as midnight-js does before it proves
// and submits. Every refusal below is the same `failed assert: <text>` a
// wallet sees before anything is proved, so nothing reaches the chain.
//
// What this covers of T-C1 / T-NEG: valid mint, wrong key, wrong arguments,
// reused nonce, cross-contract and cross-network replay, zero amount, wrong
// colour burn, and the ledger maps the state machine reconciles. What it does
// NOT cover (contract.test.ts on a local devnet, pending Q11): proving on rc.8,
// the third-party wallet seeing the coin, wallet balancing and fees.
//
// Run: bun test ./midnight-contract-logic.test.ts
import { beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import {
  Bridge,
  BridgeRuntime as rt,
  bytesToHex,
  networkTagFor,
  operatorKeyFromSolanaPublicKey,
  shieldedRecipient,
  signMint,
  tokenColor,
  type Ed25519SignatureArg,
  type MintRecipient,
} from "@solana-midnight-bridge/contracts-midnight";

const rnd = (n: number) => new Uint8Array(randomBytes(n));
const hexToBytes = (h: string) => Uint8Array.from(Buffer.from(h, "hex"));

type Deployed = { address: string; addressBytes: Uint8Array; state: any; tag: Uint8Array };

const operator = nacl.sign.keyPair();
const stranger = nacl.sign.keyPair();
const sourceMint = rnd(32);
const callerCpk = bytesToHex(rnd(32));
const contract = new Bridge.Contract({});

async function deploy(networkId = "undeployed"): Promise<Deployed> {
  const tag = networkTagFor(networkId);
  const ctor = await contract.initialState(
    rt.createConstructorContext({}, callerCpk),
    operatorKeyFromSolanaPublicKey(operator.publicKey),
    sourceMint,
    tag,
  );
  const address = rt.sampleContractAddress();
  return { address, addressBytes: hexToBytes(address), state: ctor.currentContractState, tag };
}

async function call(d: Deployed, circuit: "mintFromSolana" | "lockForSolana", ...args: unknown[]) {
  const ctx = rt.createCircuitContext({
    circuitId: circuit,
    contractAddress: d.address,
    coinPublicKeyOrZswapState: callerCpk,
    contractState: d.state,
    privateState: {},
  });
  const r = await (contract.circuits as any)[circuit](ctx, ...args);
  return { result: r.result, state: r.context.callContext.currentQueryContext.state };
}

function sign(d: Deployed, key: nacl.SignKeyPair, lockNonce: bigint, recipient: MintRecipient, amount: bigint): Ed25519SignatureArg {
  return signMint(key.secretKey, {
    contractAddress: d.addressBytes,
    networkTag: d.tag,
    lockNonce,
    recipient,
    amount,
  }).sig;
}

async function expectRefused(p: Promise<unknown>, message: string) {
  let err: unknown = null;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err).not.toBeNull();
  expect(String((err as Error).message)).toContain(message);
}

describe("mintFromSolana (local circuit execution)", () => {
  let bridge: Deployed;
  const recipient = shieldedRecipient(rnd(32));

  beforeAll(async () => {
    bridge = await deploy();
  });

  test("a valid operator signature mints the bridge colour and records the nonce", async () => {
    const sig = sign(bridge, operator, 1n, recipient, 10n);
    const r = await call(bridge, "mintFromSolana", 1n, recipient, 10n, rnd(32), sig);
    expect(bytesToHex(r.result.color)).toBe(bytesToHex(tokenColor(sourceMint, bridge.addressBytes)));
    expect(r.result.value).toBe(10n);
    const L = Bridge.ledger(r.state);
    expect([...L.mintedLocks]).toEqual([[1n, 10n]]);
    bridge.state = r.state;
  });

  test("the same lock nonce again (valid signature) → 'lock already minted'", async () => {
    const sig = sign(bridge, operator, 1n, recipient, 10n);
    await expectRefused(call(bridge, "mintFromSolana", 1n, recipient, 10n, rnd(32), sig), "lock already minted");
  });

  test("a signature by another key → 'bad signature'", async () => {
    const sig = sign(bridge, stranger, 2n, recipient, 10n);
    await expectRefused(call(bridge, "mintFromSolana", 2n, recipient, 10n, rnd(32), sig), "bad signature");
  });

  test("a signature over another amount → 'bad signature'", async () => {
    const sig = sign(bridge, operator, 2n, recipient, 10n);
    await expectRefused(call(bridge, "mintFromSolana", 2n, recipient, 11n, rnd(32), sig), "bad signature");
  });

  test("a signature over another recipient or nonce → 'bad signature'", async () => {
    const sig = sign(bridge, operator, 2n, recipient, 10n);
    await expectRefused(
      call(bridge, "mintFromSolana", 2n, shieldedRecipient(rnd(32)), 10n, rnd(32), sig),
      "bad signature",
    );
    await expectRefused(call(bridge, "mintFromSolana", 3n, recipient, 10n, rnd(32), sig), "bad signature");
  });

  test("a signature made for another bridge instance is refused (cross-contract replay)", async () => {
    const other = await deploy();
    const sigForOther = sign(other, operator, 5n, recipient, 10n);
    await expectRefused(call(bridge, "mintFromSolana", 5n, recipient, 10n, rnd(32), sigForOther), "bad signature");
    // ...while it is valid on the instance it was made for.
    const ok = await call(other, "mintFromSolana", 5n, recipient, 10n, rnd(32), sigForOther);
    expect(ok.result.value).toBe(10n);
  });

  test("a signature made for another network is refused (cross-network replay)", async () => {
    const stagenetBridge = await deploy("stagenet");
    // Same address, other network tag: sign as if for `undeployed`.
    const sigUndeployed = signMint(operator.secretKey, {
      contractAddress: stagenetBridge.addressBytes,
      networkTag: networkTagFor("undeployed"),
      lockNonce: 9n,
      recipient,
      amount: 10n,
    }).sig;
    await expectRefused(
      call(stagenetBridge, "mintFromSolana", 9n, recipient, 10n, rnd(32), sigUndeployed),
      "bad signature",
    );
  });

  test("a zero amount (even when signed) → 'zero amount'", async () => {
    const sig = sign(bridge, operator, 6n, recipient, 0n);
    await expectRefused(call(bridge, "mintFromSolana", 6n, recipient, 0n, rnd(32), sig), "zero amount");
  });

  test("two different nonces both mint (each lock settles once)", async () => {
    for (const n of [10n, 11n]) {
      const r = await call(bridge, "mintFromSolana", n, recipient, 3n, rnd(32), sign(bridge, operator, n, recipient, 3n));
      bridge.state = r.state;
    }
    const L = Bridge.ledger(bridge.state);
    expect(L.mintedLocks.size()).toBe(3n);
    expect(L.mintedLocks.lookup(11n)).toBe(3n);
  });
});

describe("lockForSolana (local circuit execution)", () => {
  let bridge: Deployed;
  const solanaRecipient = rnd(32);

  beforeAll(async () => {
    bridge = await deploy();
  });

  test("a coin of another colour → 'not the bridge colour'", async () => {
    const coin = { nonce: rnd(32), color: rnd(32), value: 4n };
    await expectRefused(call(bridge, "lockForSolana", coin, solanaRecipient), "not the bridge colour");
  });

  test("a zero-value coin of the bridge colour → 'zero amount'", async () => {
    const coin = { nonce: rnd(32), color: tokenColor(sourceMint, bridge.addressBytes), value: 0n };
    await expectRefused(call(bridge, "lockForSolana", coin, solanaRecipient), "zero amount");
  });

  test("the bridge colour is burned and recorded as withdrawal 0, then 1", async () => {
    const color = tokenColor(sourceMint, bridge.addressBytes);
    const r0 = await call(bridge, "lockForSolana", { nonce: rnd(32), color, value: 4n }, solanaRecipient);
    expect(r0.result).toBe(0n);
    bridge.state = r0.state;
    const r1 = await call(bridge, "lockForSolana", { nonce: rnd(32), color, value: 2n }, solanaRecipient);
    expect(r1.result).toBe(1n);
    const L = Bridge.ledger(r1.state);
    expect(L.withdrawalNonce).toBe(2n);
    const w = [...L.withdrawals].map(([id, v]) => [id, bytesToHex(v.solanaRecipient), v.amount]);
    expect(w).toEqual([
      [0n, bytesToHex(solanaRecipient), 4n],
      [1n, bytesToHex(solanaRecipient), 2n],
    ]);
  });
});
