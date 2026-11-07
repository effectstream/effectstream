// ============================================================================
// Wallet transaction handles (ledger-v9)
// ============================================================================
//
// midnight-js 5 hands providers era-tagged transaction handles, and wallet-sdk
// 2 takes and returns sealed `WalletTransaction` handles. This module is the
// bridge between the two, following the midnight-js 5.0.0 testkit
// (`testkit-js/src/wallet/wallet-transaction.ts`), ledger-v9 only.

import {
  DefaultForkSchedule,
  ProtocolVersion,
  WalletTransaction,
  type WalletFacade,
} from "@midnightntwrk/wallet-sdk";
// The wallet SDK's own copy of ledger-v9: whatever is handed to the SDK must be
// decoded with the copy the SDK runs, or its classes refuse each other.
import * as WalletLedger9 from "@midnightntwrk/wallet-sdk/ledger/v9";
import * as Rx from "rxjs";

type VersionedWallet = Pick<WalletFacade, "state">;

/** The stages a transaction is handed to the wallet at. */
export type WalletStage = "Unbound" | "Finalized";

type Serializable = { readonly serialize: () => Uint8Array };

const walletDecoders: Readonly<Record<WalletStage, (bytes: Uint8Array) => Serializable>> = {
  Unbound: (bytes) =>
    WalletLedger9.Transaction.deserialize("signature", "proof", "pre-binding", bytes),
  Finalized: (bytes) =>
    WalletLedger9.Transaction.deserialize("signature", "proof", "binding", bytes),
};

/** The protocol version the wallet facade is acting at right now. */
export async function activeProtocolVersion(
  wallet: VersionedWallet,
): Promise<ProtocolVersion.ProtocolVersion> {
  return (await Rx.firstValueFrom(wallet.state())).activeProtocolVersion;
}

/**
 * The epoch the chain is in right now, which is the only one the wallet will
 * unwrap into. Uses the facade's default fork schedule because the facade is
 * configured without an explicit `forks` entry.
 */
async function activeEpoch(
  wallet: VersionedWallet,
): Promise<ProtocolVersion.ProtocolVersion.Range> {
  return ProtocolVersion.epochOf(
    await activeProtocolVersion(wallet),
    DefaultForkSchedule.v9,
  );
}

/**
 * Hands a ledger-v9 transaction to the wallet SDK: decodes its bytes with the
 * wallet SDK's ledger copy and seals them at the chain's active protocol
 * version.
 */
export async function adoptInWallet<S extends WalletStage>(
  wallet: VersionedWallet,
  stage: S,
  tx: { serialize(): Uint8Array },
): Promise<WalletTransaction<S>> {
  return WalletTransaction.adopt(
    stage,
    walletDecoders[stage](tx.serialize()),
    await activeProtocolVersion(wallet),
  );
}

/**
 * Reads the bytes of a finalized wallet SDK handle, refusing a handle sealed
 * for another epoch than the one the chain is in.
 */
export async function finalizedFromWallet(
  wallet: VersionedWallet,
  handle: WalletTransaction<"Finalized">,
): Promise<Uint8Array> {
  const unwrapped = WalletTransaction.unwrapWithin<Serializable>(
    handle,
    await activeEpoch(wallet),
  );
  if (unwrapped._tag === "Left") {
    throw unwrapped.left;
  }
  return unwrapped.right.serialize();
}
