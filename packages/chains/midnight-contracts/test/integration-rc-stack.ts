import { pathToFileURL } from "node:url";

import { nativeToken } from "@midnightntwrk/ledger-v9";
import type { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import type { WalletFacade } from "@midnightntwrk/wallet-sdk-facade";
import * as Rx from "rxjs";

import { deployMidnightContract } from "../src/deploy.ts";
import {
  buildWalletFacade,
  registerNightForDust,
  resolveFacadeDustAvailableCoins,
  syncAndWaitForFunds,
} from "../src/get-wallet-info.ts";
import type { NetworkUrls, WalletResult } from "../src/types.ts";

const networkId = "undeployed" as NetworkId.NetworkId;
const timeoutMs = Number(process.env.MIDNIGHT_WALLET_SYNC_TIMEOUT_MS ?? "600000");
const fundingAmount = BigInt(process.env.M3_FUNDING_AMOUNT ?? "10000000000000");
const sourceSeed = process.env.M3_SOURCE_SEED ??
  "0000000000000000000000000000000000000000000000000000000000000001";
const recipientSeed = process.env.M3_RECIPIENT_SEED ??
  "00000000000000000000000000000000000000000000000000000000000000a3";
const contractBaseDir = requiredEnv("M3_CONTRACT_BASE_DIR");
const contractModule = requiredEnv("M3_CONTRACT_MODULE");

const networkUrls: Required<NetworkUrls> = {
  id: networkId,
  indexer: requiredEnv("MIDNIGHT_INDEXER_HTTP"),
  indexerWS: requiredEnv("MIDNIGHT_INDEXER_WS"),
  node: requiredEnv("MIDNIGHT_NODE_HTTP"),
  proofServer: requiredEnv("MIDNIGHT_PROOF_SERVER_URL"),
};

const wallets: WalletResult[] = [];
let recipientWasPassedToDeploy = false;

try {
  checkpoint("integration-start", {
    runtime: `bun-${Bun.version}`,
    networkId,
    endpoints: networkUrls,
    fundingAmount: fundingAmount.toString(),
  });

  const source = await buildWalletFacade(networkUrls, sourceSeed, networkId);
  wallets.push(source);
  await syncAndWaitForFunds(source.wallet, { timeoutMs });
  const sourceState = await waitForFacadeState(
    source.wallet,
    "source wallet with NIGHT and spendable DUST",
    (state) =>
      allStrictlyComplete(state) &&
      unshieldedNight(state) >= fundingAmount &&
      resolveFacadeDustAvailableCoins(state) >= 1,
  );
  checkpoint("source-wallet-ready", stateEvidence(sourceState));

  const recipient = await buildWalletFacade(networkUrls, recipientSeed, networkId);
  wallets.push(recipient);
  await syncAndWaitForFunds(recipient.wallet, { timeoutMs });
  const recipientBefore = await waitForFacadeState(
    recipient.wallet,
    "fresh recipient wallet fully synchronized",
    allStrictlyComplete,
  );
  if (unshieldedNight(recipientBefore) !== 0n) {
    throw new Error("recipient seed is not fresh: expected zero NIGHT before funding");
  }
  if (resolveFacadeDustAvailableCoins(recipientBefore) !== 0) {
    throw new Error("recipient seed is not fresh: expected zero spendable DUST before registration");
  }
  checkpoint("recipient-wallet-strictly-complete", stateEvidence(recipientBefore));

  const receiverAddress = await recipient.wallet.unshielded.getAddress();
  const fundingRecipe = await source.wallet.transferTransaction(
    [{
      type: "unshielded",
      outputs: [{
        type: nativeToken().raw,
        receiverAddress,
        amount: fundingAmount,
      }],
    }],
    {
      shieldedSecretKeys: source.zswapSecretKeys,
      dustSecretKey: source.dustSecretKey,
    },
    { ttl: new Date(Date.now() + 30 * 60 * 1_000) },
  );
  if (fundingRecipe.type !== "UNPROVEN_TRANSACTION") {
    throw new Error(`unexpected funding recipe type: ${fundingRecipe.type}`);
  }
  const signedFundingRecipe = await source.wallet.signRecipe(
    fundingRecipe,
    (payload) => source.unshieldedKeystore.signDataAsync(payload),
  );
  const fundingTx = await source.wallet.finalizeRecipe(signedFundingRecipe);
  const fundingTxId = await source.wallet.submitTransaction(fundingTx);
  checkpoint("fresh-wallet-funded", { fundingTxId: String(fundingTxId) });

  const fundedState = await waitForFacadeState(
    recipient.wallet,
    "fresh recipient NIGHT UTXO",
    (state) =>
      allStrictlyComplete(state) &&
      unshieldedNight(state) >= fundingAmount &&
      state.unshielded.availableCoins.some(
        (coin: { meta: { registeredForDustGeneration: boolean } }) =>
          coin.meta.registeredForDustGeneration === false,
      ),
  );
  checkpoint("recipient-funded-and-unregistered", stateEvidence(fundedState));

  if (!await registerNightForDust(recipient)) {
    throw new Error("fresh recipient NIGHT-to-DUST registration failed");
  }
  const registeredState = await waitForFacadeState(
    recipient.wallet,
    "registered wallet with spendable DUST",
    (state) =>
      allStrictlyComplete(state) && resolveFacadeDustAvailableCoins(state) >= 1,
  );
  checkpoint("recipient-dust-registered", stateEvidence(registeredState));

  const fixture = await import(pathToFileURL(contractModule).href) as {
    Counter: { Contract: unknown };
    witnesses: unknown;
  };
  recipientWasPassedToDeploy = true;
  const contractAddress = await deployMidnightContract(
    {
      contractName: "contract-counter",
      contractFileName: "contract-counter.json",
      contractClass: fixture.Counter.Contract,
      witnesses: fixture.witnesses,
      privateStateId: "counterPrivateState",
      initialPrivateState: { privateCounter: 0 },
      privateStateStoreName: "m3-counter-private-state",
      baseDir: contractBaseDir,
    },
    networkUrls,
    undefined,
    { walletResult: recipient },
  );
  if (!contractAddress) throw new Error("deployment returned an empty contract address");
  checkpoint("dust-fee-deployment-finalized", {
    contractAddress,
    networkId,
    dustCoinsBeforeDeployment: resolveFacadeDustAvailableCoins(registeredState),
  });
  checkpoint("integration-pass", { contractAddress, fundingTxId: String(fundingTxId) });
} finally {
  await Promise.allSettled(
    wallets.map((entry, index) =>
      index === 1 && recipientWasPassedToDeploy
        ? Promise.resolve()
        : entry.wallet.stop()
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

function stateEvidence(state: any): Record<string, unknown> {
  return {
    strictlyComplete: {
      shielded: state.shielded.progress.isStrictlyComplete(),
      unshielded: state.unshielded.progress.isStrictlyComplete(),
      dust: state.dust.progress.isStrictlyComplete(),
    },
    unshieldedNight: unshieldedNight(state).toString(),
    unregisteredNightCoins: state.unshielded.availableCoins.filter(
      (coin: { meta: { registeredForDustGeneration: boolean } }) =>
        coin.meta.registeredForDustGeneration === false,
    ).length,
    dustAvailableCoins: resolveFacadeDustAvailableCoins(state),
  };
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
        first: timeoutMs,
        with: () => Rx.throwError(
          () => new Error(`timeout waiting for ${description}; latest=${latest}`),
        ),
      }),
    ),
  );
}

function checkpoint(name: string, details: Record<string, unknown> = {}): void {
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
