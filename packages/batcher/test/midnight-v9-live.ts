import { Buffer } from "node:buffer";

import { nativeToken } from "@midnightntwrk/ledger-v9";
import type { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import type { WalletFacade } from "@midnightntwrk/wallet-sdk-facade";
import {
  buildWalletFacade,
  registerNightForDust,
  resolveFacadeDustAvailableCoins,
  syncAndWaitForFunds,
  type NetworkUrls,
  type WalletResult,
} from "@effectstream/midnight-contracts";
import * as Rx from "rxjs";

import { MidnightBalancingAdapter } from "../adapters/midnight-balancing-adapter.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const networkId = "undeployed" as NetworkId.NetworkId;
const timeoutMs = Number(
  process.env.MIDNIGHT_WALLET_SYNC_TIMEOUT_MS ?? "600000",
);
const feeWalletNight = BigInt(
  process.env.M5_FEE_WALLET_NIGHT ?? "10000000000000",
);
const transferAmount = BigInt(process.env.M5_TRANSFER_AMOUNT ?? "1000000");
const minimumSpendableDust = BigInt(
  process.env.M5_MIN_SPENDABLE_DUST ?? "450000000000000",
);
const sourceSeed = process.env.M5_SOURCE_SEED ??
  "0000000000000000000000000000000000000000000000000000000000000001";
const userSeed = process.env.M5_USER_SEED ??
  "0000000000000000000000000000000000000000000000000000000000000002";
const feeSeed = process.env.M5_FEE_SEED ?? "b5".repeat(32);
const recipientSeed = process.env.M5_RECIPIENT_SEED ?? "c5".repeat(32);

const networkUrls: Required<NetworkUrls> = {
  id: networkId,
  indexer: requiredEnv("MIDNIGHT_INDEXER_HTTP"),
  indexerWS: requiredEnv("MIDNIGHT_INDEXER_WS"),
  node: requiredEnv("MIDNIGHT_NODE_HTTP"),
  proofServer: requiredEnv("MIDNIGHT_PROOF_SERVER_URL"),
};

const wallets: WalletResult[] = [];
type UnshieldedReceiverAddress = Awaited<
  ReturnType<WalletFacade["unshielded"]["getAddress"]>
>;

try {
  checkpoint("integration-start", {
    runtime: `bun-${Bun.version}`,
    networkId,
    endpoints: networkUrls,
    feeWalletNight: feeWalletNight.toString(),
    transferAmount: transferAmount.toString(),
  });

  const source = await startWallet(sourceSeed);
  const sourceState = await waitForFacadeState(
    source.wallet,
    "genesis source with NIGHT and DUST",
    (state) =>
      allStrictlyComplete(state) &&
      unshieldedNight(state) >= feeWalletNight &&
      resolveFacadeDustAvailableCoins(state) >= 1,
  );
  checkpoint("source-wallet-ready", stateEvidence(sourceState));

  const feeWallet = await startWallet(feeSeed);
  const freshFeeState = await waitForFacadeState(
    feeWallet.wallet,
    "fresh fee wallet",
    allStrictlyComplete,
  );
  if (unshieldedNight(freshFeeState) !== 0n) {
    throw new Error("fee wallet is not fresh: expected zero NIGHT");
  }
  if (resolveFacadeDustAvailableCoins(freshFeeState) !== 0) {
    throw new Error("fee wallet is not fresh: expected zero DUST coins");
  }
  checkpoint("fee-wallet-fresh", stateEvidence(freshFeeState));

  const fundingTxId = await transferAndSubmit(
    source,
    await feeWallet.wallet.unshielded.getAddress(),
    feeWalletNight,
    true,
  );
  const fundedFeeState = await waitForFacadeState(
    feeWallet.wallet,
    "fee wallet funded with exactly 10^7 NIGHT",
    (state) =>
      allStrictlyComplete(state) &&
      unshieldedNight(state) === feeWalletNight &&
      unregisteredNightCoins(state) === 1,
  );
  checkpoint("fee-wallet-funded", {
    fundingTxId,
    ...stateEvidence(fundedFeeState),
  });

  if (!await registerNightForDust(feeWallet)) {
    throw new Error("fee wallet NIGHT-to-DUST registration failed");
  }
  const registeredFeeState = await waitForFacadeState(
    feeWallet.wallet,
    "fee wallet with spendable DUST",
    (state) =>
      allStrictlyComplete(state) &&
      unshieldedNight(state) === feeWalletNight &&
      spendableDustCoins(state) >= 1,
  );
  checkpoint("fee-wallet-dust-ready", stateEvidence(registeredFeeState));

  const user = await startWallet(userSeed);
  const userState = await waitForFacadeState(
    user.wallet,
    "third-party wallet with NIGHT",
    (state) =>
      allStrictlyComplete(state) && unshieldedNight(state) >= transferAmount,
  );
  const recipient = await startWallet(recipientSeed);
  const recipientBefore = await waitForFacadeState(
    recipient.wallet,
    "fresh third-party recipient",
    allStrictlyComplete,
  );
  if (unshieldedNight(recipientBefore) !== 0n) {
    throw new Error("third-party recipient is not fresh");
  }
  checkpoint("third-party-wallets-ready", {
    user: stateEvidence(userState),
    recipient: stateEvidence(recipientBefore),
  });

  const delegatedRecipe = await user.wallet.transferTransaction(
    [{
      type: "unshielded",
      outputs: [{
        type: nativeToken().raw,
        receiverAddress: await recipient.wallet.unshielded.getAddress(),
        amount: transferAmount,
      }],
    }],
    {
      shieldedSecretKeys: user.zswapSecretKeys,
      dustSecretKey: user.dustSecretKey,
    },
    {
      ttl: new Date(Date.now() + 30 * 60 * 1_000),
      payFees: false,
    },
  );
  if (delegatedRecipe.type !== "UNPROVEN_TRANSACTION") {
    throw new Error(`unexpected delegated recipe type: ${delegatedRecipe.type}`);
  }
  if (delegatedRecipe.blockData !== undefined) {
    throw new Error("third-party recipe unexpectedly paid its own DUST fee");
  }
  const signedDelegatedRecipe = await user.wallet.signRecipe(
    delegatedRecipe,
    (payload) => user.unshieldedKeystore.signDataAsync(payload),
  );
  if (signedDelegatedRecipe.type !== "UNPROVEN_TRANSACTION") {
    throw new Error(
      `unexpected signed delegated recipe type: ${signedDelegatedRecipe.type}`,
    );
  }
  checkpoint("third-party-signature-evidence", {
    lifecycle: "after-user-sign",
    signatures: unshieldedSignatureEvidence(
      signedDelegatedRecipe.transaction,
    ),
  });
  const delegatedTxHex = Buffer.from(
    signedDelegatedRecipe.transaction.serialize(),
  ).toString("hex");
  checkpoint("third-party-feeless-transaction-built", {
    recipeType: delegatedRecipe.type,
    hasDustBlockData: delegatedRecipe.blockData !== undefined,
    serializedBytes: delegatedTxHex.length / 2,
  });

  installSignatureDiagnostics(feeWallet.wallet);
  const adapter = new MidnightBalancingAdapter(feeSeed, {
    indexer: networkUrls.indexer,
    indexerWS: networkUrls.indexerWS,
    node: networkUrls.node,
    proofServer: networkUrls.proofServer,
    walletNetworkId: networkId,
    walletFundingTimeoutSeconds: Math.ceil(timeoutMs / 1000),
    walletResult: feeWallet,
    maxSlotsPerWallet: 2,
    dustWaitTimeoutMs: timeoutMs,
    minSpendableDustPerCoin: minimumSpendableDust,
  });
  await (adapter as unknown as { initializationPromise: Promise<void> })
    .initializationPromise;
  if (!adapter.isReady() || !adapter.hasAvailableCapacity()) {
    throw new Error("balancing adapter did not expose a spendable worker");
  }
  checkpoint("batcher-ready", {
    account: adapter.getAccountAddress(),
    chain: adapter.getChainName(),
    feeWalletNight: unshieldedNight(registeredFeeState).toString(),
    feeWalletDustCoins: resolveFacadeDustAvailableCoins(registeredFeeState),
    spendableDustCoins: spendableDustCoins(registeredFeeState),
  });

  const input = {
    addressType: 5,
    address: user.unshieldedAddress,
    timestamp: String(Date.now()),
    input: JSON.stringify({ tx: delegatedTxHex, txStage: "unproven" }),
    target: "midnight-balancer",
  } as DefaultBatcherInput;
  const validation = adapter.validateInput(input);
  if (!validation.valid) {
    throw new Error(`batcher rejected third-party input: ${validation.error}`);
  }
  const built = adapter.buildBatchData([input]);
  if (!built || built.selectedInputs.length !== 1) {
    throw new Error("batcher did not select the third-party transaction");
  }

  let submittedHash: string;
  try {
    submittedHash = await adapter.submitBatch(built.data, 0n);
  } finally {
    adapter.releaseBatchResources(built.data);
  }
  checkpoint("batcher-balanced-proved-submitted", { submittedHash });

  const receipt = await adapter.waitForTransactionReceipt(
    submittedHash,
    timeoutMs,
  );
  if (receipt.status !== 1) {
    throw new Error(`third-party transaction receipt failed: ${receipt.status}`);
  }
  const recipientAfter = await waitForFacadeState(
    recipient.wallet,
    "recipient finalized NIGHT increase",
    (state) =>
      allStrictlyComplete(state) &&
      unshieldedNight(state) === transferAmount,
  );
  checkpoint("third-party-transaction-landed", {
    submittedHash,
    blockNumber: receipt.blockNumber.toString(),
    receiptStatus: receipt.status,
    recipientNightBefore: unshieldedNight(recipientBefore).toString(),
    recipientNightAfter: unshieldedNight(recipientAfter).toString(),
    recipientDelta: (
      unshieldedNight(recipientAfter) - unshieldedNight(recipientBefore)
    ).toString(),
  });
  checkpoint("integration-pass", {
    submittedHash,
    fundingTxId,
    feeWalletNight: feeWalletNight.toString(),
    tokenKindsToBalance: ["dust"],
  });
} finally {
  await Promise.allSettled(wallets.map(({ wallet }) => wallet.stop()));
}

async function startWallet(seed: string): Promise<WalletResult> {
  const wallet = await buildWalletFacade(networkUrls, seed, networkId);
  wallets.push(wallet);
  await syncAndWaitForFunds(wallet.wallet, { timeoutMs });
  return wallet;
}

async function transferAndSubmit(
  source: WalletResult,
  receiverAddress: UnshieldedReceiverAddress,
  amount: bigint,
  payFees: boolean,
): Promise<string> {
  const recipe = await source.wallet.transferTransaction(
    [{
      type: "unshielded",
      outputs: [{ type: nativeToken().raw, receiverAddress, amount }],
    }],
    {
      shieldedSecretKeys: source.zswapSecretKeys,
      dustSecretKey: source.dustSecretKey,
    },
    { ttl: new Date(Date.now() + 30 * 60 * 1_000), payFees },
  );
  if (recipe.type !== "UNPROVEN_TRANSACTION") {
    throw new Error(`unexpected transfer recipe type: ${recipe.type}`);
  }
  const signed = await source.wallet.signRecipe(
    recipe,
    (payload) => source.unshieldedKeystore.signDataAsync(payload),
  );
  return String(
    await source.wallet.submitTransaction(
      await source.wallet.finalizeRecipe(signed),
    ),
  );
}

function allStrictlyComplete(state: any): boolean {
  return state.shielded.progress.isStrictlyComplete() &&
    state.unshielded.progress.isStrictlyComplete() &&
    state.dust.progress.isStrictlyComplete();
}

function unshieldedNight(state: any): bigint {
  return state.unshielded.balances[nativeToken().raw] ?? 0n;
}

function unregisteredNightCoins(state: any): number {
  return state.unshielded.availableCoins.filter(
    (coin: { meta: { registeredForDustGeneration: boolean } }) =>
      coin.meta.registeredForDustGeneration === false,
  ).length;
}

function spendableDustCoins(state: any): number {
  return (state.dust.availableCoins as Array<{ generatedNow?: bigint | string }>)
    .filter((coin) => BigInt(coin.generatedNow ?? 0) >= minimumSpendableDust)
    .length;
}

function stateEvidence(state: any): Record<string, unknown> {
  return {
    strictlyComplete: {
      shielded: state.shielded.progress.isStrictlyComplete(),
      unshielded: state.unshielded.progress.isStrictlyComplete(),
      dust: state.dust.progress.isStrictlyComplete(),
    },
    unshieldedNight: unshieldedNight(state).toString(),
    unregisteredNightCoins: unregisteredNightCoins(state),
    dustAvailableCoins: resolveFacadeDustAvailableCoins(state),
    spendableDustCoins: spendableDustCoins(state),
  };
}

function installSignatureDiagnostics(wallet: WalletFacade): void {
  const diagnosticWallet = wallet as any;
  const balanceUnproven = diagnosticWallet.balanceUnprovenTransaction.bind(
    diagnosticWallet,
  );
  diagnosticWallet.balanceUnprovenTransaction = async (...args: unknown[]) => {
    checkpoint("third-party-signature-evidence", {
      lifecycle: "before-dust-balance",
      signatures: unshieldedSignatureEvidence(args[0]),
    });
    const recipe = await balanceUnproven(...args);
    checkpoint("third-party-signature-evidence", {
      lifecycle: "after-dust-balance",
      signatures: unshieldedSignatureEvidence(recipe.transaction),
    });
    return recipe;
  };

  const signRecipe = diagnosticWallet.signRecipe.bind(diagnosticWallet);
  diagnosticWallet.signRecipe = async (...args: unknown[]) => {
    const recipe = args[0] as { transaction?: unknown };
    checkpoint("third-party-signature-evidence", {
      lifecycle: "before-batcher-sign",
      signatures: unshieldedSignatureEvidence(recipe.transaction),
    });
    const signedRecipe = await signRecipe(...args);
    checkpoint("third-party-signature-evidence", {
      lifecycle: "after-batcher-sign",
      signatures: unshieldedSignatureEvidence(signedRecipe.transaction),
    });
    return signedRecipe;
  };

  const finalizeRecipe = diagnosticWallet.finalizeRecipe.bind(
    diagnosticWallet,
  );
  diagnosticWallet.finalizeRecipe = async (...args: unknown[]) => {
    const recipe = args[0] as { transaction?: unknown };
    checkpoint("third-party-signature-evidence", {
      lifecycle: "before-finalize",
      signatures: unshieldedSignatureEvidence(recipe.transaction),
    });
    const finalized = await finalizeRecipe(...args);
    checkpoint("third-party-signature-evidence", {
      lifecycle: "after-finalize",
      signatures: unshieldedSignatureEvidence(finalized),
    });
    return finalized;
  };
}

function unshieldedSignatureEvidence(transaction: any): unknown[] {
  if (!transaction?.intents) return [];
  return transaction.intents.entries().toArray().map(
    ([segment, intent]: [number, any]) => ({
      segment,
      guaranteed: {
        inputs: intent.guaranteedUnshieldedOffer?.inputs?.length ?? 0,
        signatures: intent.guaranteedUnshieldedOffer?.signatures?.length ?? 0,
      },
      fallible: {
        inputs: intent.fallibleUnshieldedOffer?.inputs?.length ?? 0,
        signatures: intent.fallibleUnshieldedOffer?.signatures?.length ?? 0,
      },
    }),
  );
}

function waitForFacadeState(
  wallet: WalletFacade,
  description: string,
  predicate: (state: any) => boolean,
): Promise<any> {
  let latest = "no state emitted";
  return Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.tap((state) => {
        latest = JSON.stringify(stateEvidence(state));
      }),
      Rx.filter(predicate),
      Rx.timeout({
        each: timeoutMs,
        with: () =>
          Rx.throwError(
            () => new Error(
              `timeout waiting for ${description}; latest=${latest}`,
            ),
          ),
      }),
    ),
  );
}

function checkpoint(
  name: string,
  details: Record<string, unknown> = {},
): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    checkpoint: name,
    ...details,
  }));
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing required environment variable ${name}`);
  return value;
}
