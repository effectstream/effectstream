// Create and settle offers with the built-in JS wallet (wallet facade) — the
// facade-side counterpart of makerOffer.ts (Lace makeIntent) and
// browserOffers.proveAndSubmitOffer (Lace balanceSealedTransaction /
// mirror-merge).
//
// The facade path is structurally SIMPLER than the Lace one: Lace's makeIntent
// hardcodes its balancing Intent at segment 1, which forced the taker flow into
// balanceSealedTransaction and the shielded mirror+merge workaround. The
// facade's swap API was built for this handshake:
//
//   maker:  initSwap → [signRecipe if unshielded gives] → finalizeRecipe(prove)
//           → serialize → MIP-0005 encode
//   taker:  decode N → merge the N maker txs → balanceFinalizedTransaction →
//           [signRecipe if the taker pays unshielded anywhere in the batch] →
//           finalizeRecipe (proves the balancing tx and merges it with the
//           merged maker tx) → ONE batcher submit
//
// Taking several offers is one settlement, not several: see
// services/offerBatch.ts for why (per-offer settlement double-spent the taker's
// only coin) and for the single constraint on merging.
//
// Fee policy matches the rest of the app: nobody here pays Dust. The maker
// offer is intentionally imbalanced (payFees:false); the taker balances only
// the value legs (tokenKindsToBalance omits 'dust'); the batcher pays fees at
// submission.
//
// Signing: unshielded inputs are signed — the signature covers the segment and
// bind() is irreversible, so signRecipe MUST run before finalizeRecipe.
// Omitting it is not an immediate error; the node rejects the settlement later
// with SIGNATURE_INVALID (exactly the trap the kernel repo's e2e STRETCH hit).
// Shielded legs carry no signatures (ZK proofs + Pedersen binding), so the
// sign step is skipped when no unshielded leg is involved.

import type { NetworkId } from '@midnight-ntwrk/midnight-js-types';
import { Transaction as LedgerV9Transaction } from '@midnightntwrk/ledger-v9';
import { ProtocolVersion, WalletTransaction } from '@midnightntwrk/wallet-sdk-abstractions';
import { DefaultForkSchedule } from '@midnightntwrk/wallet-sdk-facade';
import { MidnightBech32m, UnshieldedAddress } from '@midnightntwrk/wallet-sdk-address-format';
import { OfferFiles } from '@effectstream/mip-zswap-offer/mip5';
import type { OfferLeg } from './makerOffer';
import type { MidnightRuntimeConfig } from './api';
import { batchPaysUnshielded, decodeMakerOffers, mergeMakerOffers } from './offerBatch';
import { submitToBatcher } from './api';
import { dlog, timed } from '../debug';

/** Offers carry a 1h TTL — matches what the backend reports as ttlSeconds. */
const OFFER_TTL_MS = 3600_000;

/** The slice of MidnightLocalApi this module needs (facade mode only). */
interface LocalApiShape {
  unshieldedAddress?: string;
  walletResult?: {
    wallet: any;
    unshieldedKeystore: any;
  };
}

function facadeParts(localApi: LocalApiShape) {
  const r = localApi.walletResult;
  if (!r?.wallet || !r?.unshieldedKeystore) {
    throw new Error('JS wallet is not fully initialised — offers need the full wallet facade.');
  }
  // wallet-sdk 2 balances and proves with the key material the facade was
  // started from; no secret keys are passed per call.
  return { facade: r.wallet, keystore: r.unshieldedKeystore };
}

// wallet-sdk 2 takes and returns sealed `WalletTransaction` handles, bound to
// the protocol version the wallet is acting at; the offer bytes on the wire are
// plain ledger-v9 transactions. These helpers convert between the two.

async function activeProtocolVersion(facade: any): Promise<ProtocolVersion.ProtocolVersion> {
  const state: any = await new Promise((resolve, reject) => {
    const sub = facade.state().subscribe({
      next: (value: unknown) => {
        queueMicrotask(() => sub.unsubscribe());
        resolve(value);
      },
      error: reject,
    });
  });
  return state.activeProtocolVersion;
}

/** Seals a finalized ledger-v9 transaction for the facade. */
async function adoptFinalized(facade: any, tx: { serialize(): Uint8Array }) {
  const decoded = LedgerV9Transaction.deserialize('signature', 'proof', 'binding', tx.serialize());
  return WalletTransaction.adopt('Finalized', decoded, await activeProtocolVersion(facade));
}

/** Reads the bytes of a finalized facade handle sealed for the current epoch. */
async function finalizedBytes(facade: any, handle: WalletTransaction<'Finalized'>): Promise<Uint8Array> {
  const epoch = ProtocolVersion.epochOf(await activeProtocolVersion(facade), DefaultForkSchedule.v9);
  const unwrapped = WalletTransaction.unwrapWithin<{ serialize(): Uint8Array }>(handle, epoch);
  if (unwrapped._tag === 'Left') throw unwrapped.left;
  return unwrapped.right.serialize();
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/**
 * Build a maker's bech32m offer blob via the wallet facade.
 * Facade twin of makerOffer.buildMakerOfferBlob (Lace).
 */
export async function buildMakerOfferBlobLocal(
  localApi: LocalApiShape,
  networkId: string,
  gives: OfferLeg[],
  wants: OfferLeg[],
): Promise<string> {
  const { facade, keystore } = facadeParts(localApi);

  // gives → desired inputs: what the maker's wallet must supply, per layer.
  const inputs: { shielded?: Record<string, bigint>; unshielded?: Record<string, bigint> } = {};
  for (const g of gives) {
    const bucket = (inputs[g.kind] ??= {});
    bucket[g.color] = (bucket[g.color] ?? 0n) + g.amount;
  }

  // wants → desired outputs, addressed to SELF: the maker receives the wanted
  // tokens when a taker fills the offer. Receiver addresses must be real
  // address-format instances (they are Symbol-branded — the single-instance
  // rule in link.sh exists precisely so these brands match the facade's).
  const { getInitialShieldedState } = await import('@effectstream/midnight-contracts/wallet-info');
  const shieldedAddress =
    wants.some((w) => w.kind === 'shielded')
      ? (await getInitialShieldedState(facade.shielded)).address
      : null;
  const unshieldedAddress =
    wants.some((w) => w.kind === 'unshielded')
      ? MidnightBech32m.parse(
          localApi.unshieldedAddress ?? keystore.getBech32Address().asString(),
        ).decode(UnshieldedAddress, networkId as never)
      : null;

  const outputs: any[] = [];
  const shieldedWants = wants.filter((w) => w.kind === 'shielded');
  const unshieldedWants = wants.filter((w) => w.kind === 'unshielded');
  if (shieldedWants.length > 0) {
    outputs.push({
      type: 'shielded',
      outputs: shieldedWants.map((w) => ({
        type: w.color,
        receiverAddress: shieldedAddress,
        amount: w.amount,
      })),
    });
  }
  if (unshieldedWants.length > 0) {
    outputs.push({
      type: 'unshielded',
      outputs: unshieldedWants.map((w) => ({
        type: w.color,
        receiverAddress: unshieldedAddress,
        amount: w.amount,
      })),
    });
  }

  dlog('localOffer.build: initSwap', {
    inputs: Object.fromEntries(
      Object.entries(inputs).map(([k, v]) => [
        k,
        Object.fromEntries(Object.entries(v).map(([c, a]) => [c.slice(0, 12), a.toString()])),
      ]),
    ),
    outputKinds: outputs.map((o) => o.type),
  });

  let recipe = await timed('localOffer.build: facade.initSwap', () =>
    facade.initSwap(inputs, outputs, {
      ttl: new Date(Date.now() + OFFER_TTL_MS),
      // The offer stays imbalanced and carries no Dust — taker balances,
      // batcher pays fees.
      payFees: false,
    }),
  );

  if (gives.some((g) => g.kind === 'unshielded')) {
    recipe = await timed('localOffer.build: facade.signRecipe (unshielded gives)', () =>
      facade.signRecipe(recipe, (payload: Uint8Array) => keystore.signDataAsync(payload)),
    );
  }

  // finalizeRecipe proves the unproven swap tx via the facade's prover client
  // (the proof server buildWalletFacade was configured with).
  const finalized = await timed('localOffer.build: facade.finalizeRecipe (prove)', () =>
    facade.finalizeRecipe(recipe),
  );

  return OfferFiles.encode(await finalizedBytes(facade, finalized as WalletTransaction<'Finalized'>));
}

/**
 * Take one or more offers via the wallet facade, as a SINGLE transaction: fold
 * the makers' proven, imbalanced txs together, balance the taker side of the
 * whole ladder once, and route the merged settlement through the batcher.
 * Facade twin of browserOffers.proveAndSubmitOffer (Lace).
 *
 * Balancing the batch once is what makes a ladder work at all. Per-offer
 * settlement re-selected the taker's coins from wallet state that had not seen
 * the previous take's spend, so the node rejected take #2 as a double spend
 * (`Zswap(NullifierAlreadyPresent)`) and only the first offer was ever bought.
 * See services/offerBatch.ts for the merge and its one constraint.
 *
 * The whole batch is decoded and merged BEFORE anything is submitted, so a
 * ladder either settles as one transaction or does not settle at all.
 */
export async function settleOffersLocal(
  localApi: LocalApiShape,
  config: MidnightRuntimeConfig,
  offerBech32ms: string[],
): Promise<{ txHash: string }> {
  const { facade, keystore } = facadeParts(localApi);
  const networkId = config.networkId as NetworkId;

  const decoded = decodeMakerOffers(offerBech32ms, networkId);
  const makerTx = mergeMakerOffers(decoded);
  dlog('localOffer.settle: maker txs decoded + merged', {
    offers: decoded.length,
    bytes: decoded.map((d) => d.raw.length),
  });

  // What the taker pays = the makers' wants. Any unshielded leg anywhere in the
  // batch puts an unshielded input in the settlement, so it must be signed.
  const paysUnshielded = batchPaysUnshielded(offerBech32ms, networkId);

  const makerHandle = await adoptFinalized(facade, makerTx);
  let recipe = await timed('localOffer.settle: facade.balanceFinalizedTransaction', () =>
    facade.balanceFinalizedTransaction(makerHandle, {
      ttl: new Date(Date.now() + OFFER_TTL_MS),
      // Value legs only — the batcher contributes the Dust at submission.
      tokenKindsToBalance: ['shielded', 'unshielded'],
    }),
  );

  if (paysUnshielded) {
    recipe = await timed('localOffer.settle: facade.signRecipe (unshielded pays)', () =>
      facade.signRecipe(recipe, (payload: Uint8Array) => keystore.signDataAsync(payload)),
    );
  }

  // Proves the taker's balancing tx and merges it with the (already merged)
  // maker txs — merge keeps each party's signatures on their own segments.
  const settlement = await timed('localOffer.settle: facade.finalizeRecipe (prove+merge)', () =>
    facade.finalizeRecipe(recipe),
  );

  const serializedHex = toHex(await finalizedBytes(facade, settlement as WalletTransaction<'Finalized'>));
  const address = localApi.unshieldedAddress ?? keystore.getBech32Address().asString();
  dlog('localOffer.settle: → submitToBatcher (one submission for the whole batch)', {
    offers: decoded.length,
    bytes: serializedHex.length / 2,
  });
  const { txHash } = await submitToBatcher(serializedHex, 'finalized', address);
  return { txHash };
}

/**
 * Single-offer take — the degenerate N=1 of {@link settleOffersLocal}, so both
 * paths prove, merge and submit through exactly the same code.
 */
export function settleOfferLocal(
  localApi: LocalApiShape,
  config: MidnightRuntimeConfig,
  offerBech32m: string,
): Promise<{ txHash: string }> {
  return settleOffersLocal(localApi, config, [offerBech32m]);
}
