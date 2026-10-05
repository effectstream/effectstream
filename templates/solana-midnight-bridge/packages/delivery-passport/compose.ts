// ONE Midnight transaction delivering a bridge mint into a Passport account (plan 00058 Interfaces
// D-2/D-5; the recipe G-COMPOSE proved on 2026-10-04 with this template's SDK set, after Night
// Market's `direct` path, relay/src/demo/faucet.ts:229-364):
//
//   intent = [ bridge.mintFromSolana(lockNonce, right(account), amount, mintNonce, sig),
//              account.deposit_shielded(coin, sealEntryPortable(account.enc_key, coin)) ]
//
// - the mint is run first (locally): the coin it returns must have exactly the signed amount and
//   the bridge's colour, BEFORE anything is sealed;
// - the account's `enc_key` is read from the chain immediately before sealing;
// - two root calls (Compact contracts cannot call each other here), each a ContractCallPrototype
//   with midnight-js's contract key location (address, circuit, verifier-key hash), so the proof
//   provider resolves each call's keys by content;
// - the deposit call's Zswap offer is the transaction's only offer (the mint's output is claimed by
//   the deposit's `receiveShielded`; the ledger refuses the mint without that claim: G-COMPOSE N1).
// The SDK functions are injected, so the builder is tested without a chain.
import type { DeliveredCoin, DeliveryHooks, DeliveryResult, SignedMint } from "@solana-midnight-bridge/delivery";

export const DELIVERY_CIRCUITS = ["mintFromSolana", "deposit_shielded"] as const;
export const MAX_TTL_MS = 60 * 60 * 1000;

/** ledger-v9's pieces the composition uses. */
export type LedgerApi = {
  ContractState: { deserialize(b: Uint8Array): { operation(id: string): { verifierKey?: Uint8Array } | undefined } };
  ContractCallPrototype: new (...a: unknown[]) => unknown;
  communicationCommitmentRandomness(): unknown;
  Intent: { new: (ttl: Date) => { addCall(c: unknown): any } };
  Transaction: { fromPartsRandomized(networkId: string, guaranteed: unknown, fallible: unknown, intent: unknown): unknown };
};

export type ComposeDeps = {
  createUnprovenCallTx: (providers: any, options: any) => Promise<any>;
  submitTx: (providers: any, options: { unprovenTx: unknown; circuitId: readonly string[] }) => Promise<any>;
  ledger: LedgerApi;
  encodeContractKeyLocation: (o: { contractAddress: string; circuitId: string; verifierKeyHash: string }) => string;
  hashVerifierKey: (vk: Uint8Array) => string;
  seal: (encKey: Uint8Array, coin: { nonce: Uint8Array; color: Uint8Array; value: bigint }) => Promise<Uint8Array>;
  now?: () => number;
};

export type ComposeInput = {
  networkId: string;
  bridge: { address: string; compiled: unknown; colour: string };
  account: { address: string; compiled: unknown; readEncKey: (state: any) => Uint8Array };
  mint: SignedMint;
  /** Providers for the bridge's call, the account's call (its zk config is the bundle's), the
   *  submission (its proof provider resolves both bundles), and the reads. */
  providers: { bridge: any; account: any; submit: any; publicData: { queryContractState(a: string): Promise<any> } };
  ttlMs?: number;
  hooks?: DeliveryHooks;
};

export class ComposeError extends Error {
  override name = "ComposeError";
}

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex");

function prototype(deps: ComposeDeps, address: string, circuitId: string, state: { serialize(): Uint8Array }, call: any): unknown {
  const operation = deps.ledger.ContractState.deserialize(state.serialize()).operation(circuitId);
  if (!operation?.verifierKey) throw new ComposeError(`no ${circuitId} operation at ${address.slice(0, 16)}…`);
  const keyLocation = deps.encodeContractKeyLocation({ contractAddress: address, circuitId, verifierKeyHash: deps.hashVerifierKey(operation.verifierKey) });
  return new deps.ledger.ContractCallPrototype(
    address, circuitId, operation,
    call.public.partitionedTranscript[0], call.public.partitionedTranscript[1],
    call.private.privateTranscriptOutputs, call.private.input, call.private.output,
    deps.ledger.communicationCommitmentRandomness(), keyLocation,
  );
}

/** Builds the composed, unproven transaction (no submission). */
export async function buildDeliveryTransaction(deps: ComposeDeps, o: ComposeInput): Promise<{ tx: unknown; coin: DeliveredCoin; entry: Uint8Array; ttl: Date }> {
  const now = deps.now ?? Date.now;
  const ttlMs = Math.min(o.ttlMs ?? MAX_TTL_MS, MAX_TTL_MS);
  const m = o.mint;
  if (m.recipient.is_left !== false || hex(m.recipient.right.bytes) !== o.account.address) {
    throw new ComposeError(`the signed mint names another recipient than ${o.account.address}`);
  }
  const mintCall = await deps.createUnprovenCallTx(o.providers.bridge, {
    compiledContract: o.bridge.compiled,
    contractAddress: o.bridge.address,
    circuitId: DELIVERY_CIRCUITS[0],
    args: [m.lockNonce, m.recipient, m.amount, m.mintNonce, m.sig],
  });
  const minted = mintCall?.private?.result as { nonce: Uint8Array; color: Uint8Array; value: bigint } | undefined;
  if (!minted || minted.value !== m.amount) throw new ComposeError(`the mint returned value ${minted?.value}, the signed amount is ${m.amount}`);
  if (hex(minted.color) !== o.bridge.colour) throw new ComposeError(`the minted coin's colour ${hex(minted.color)} is not the bridge's ${o.bridge.colour}`);
  // enc_key: read from the chain right before sealing (an account may rotate it).
  const accountState = await o.providers.publicData.queryContractState(o.account.address);
  if (!accountState) throw new ComposeError(`no contract state at ${o.account.address}`);
  const encKey = o.account.readEncKey(accountState);
  const entry = await deps.seal(encKey, { nonce: minted.nonce, color: minted.color, value: minted.value });
  const depositCall = await deps.createUnprovenCallTx(o.providers.account, {
    compiledContract: o.account.compiled,
    contractAddress: o.account.address,
    circuitId: DELIVERY_CIRCUITS[1],
    args: [minted, entry],
  });
  const bridgeState = await o.providers.publicData.queryContractState(o.bridge.address);
  if (!bridgeState) throw new ComposeError(`no contract state at the bridge ${o.bridge.address}`);
  const ttl = new Date(now() + ttlMs);
  const intent = deps.ledger.Intent.new(ttl)
    .addCall(prototype(deps, o.bridge.address, DELIVERY_CIRCUITS[0], bridgeState, mintCall))
    .addCall(prototype(deps, o.account.address, DELIVERY_CIRCUITS[1], accountState, depositCall));
  const receiver = depositCall.private.unprovenTx as { guaranteedOffer?: unknown; fallibleOffer?: Map<number, unknown> };
  const fallible = [...(receiver.fallibleOffer?.values() ?? [])];
  if (fallible.length > 1) throw new ComposeError("the deposit call has more than one fallible offer");
  const tx = deps.ledger.Transaction.fromPartsRandomized(o.networkId, receiver.guaranteedOffer, fallible[0], intent);
  return { tx, coin: { nonce: hex(minted.nonce), colour: hex(minted.color), value: minted.value.toString() }, entry, ttl };
}

/** Builds, proves, balances, submits and waits for the composed transaction. */
export async function deliverComposed(deps: ComposeDeps, o: ComposeInput): Promise<DeliveryResult> {
  const { tx, coin } = await buildDeliveryTransaction(deps, o);
  await o.hooks?.onComposed?.(coin);
  const r = await deps.submitTx(o.providers.submit, { unprovenTx: tx, circuitId: DELIVERY_CIRCUITS });
  const status = r?.status;
  if (status !== undefined && status !== "SucceedEntirely") {
    throw new ComposeError(`the delivery transaction ${r?.txId ?? "?"} did not succeed: ${String(status)}`);
  }
  return { tx: String(r?.txId ?? r?.txHash ?? ""), coin };
}
