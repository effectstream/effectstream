// 00050 E3 e2e: a third-party shielded mint through MidnightAdapter.
//
// The genesis wallet calls the counter contract's `mint_shielded_to` for a
// fresh recipient wallet (random seed, never logged). The recipient's coin
// public key is the circuit argument; its encryption public key travels in the
// input's `coinEncPublicKeyMappings`, which the adapter hands to midnight-js as
// `additionalCoinEncPublicKeyMappings`.
//
// 1. Without the mapping the call must fail locally with midnight-js
//    "Unable to resolve encryption public key" (nothing is proved or sent).
// 2. With the mapping the mint is confirmed, and the recipient wallet's own
//    sync finds the coin.
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { MidnightAdapter, type DefaultBatcherInput } from "@effectstream/batcher-sdk";
import {
  buildWalletFacade,
  syncAndWaitForFunds,
  waitForDustFunds,
  type WalletResult,
} from "@effectstream/midnight-contracts";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import {
  formatShieldedAddress,
  shieldedAddressToCoinEncPublicKeyMapping,
} from "@effectstream/midnight-contracts/shielded-address";
import { Counter, witnesses } from "@e2e/midnight-contracts/counter";

const TAG = "[third-party-mint]";
const MINT_AMOUNT = 4_242n;
// Distinct from trigger-token-mints' separators (d4 / e5).
const DOMAIN_SEP_HEX = "f6".repeat(32);
const RECIPIENT_SYNC_TIMEOUT_MS = 300_000;

const currentDir = dirname(new URL(import.meta.url).pathname);
const midnightContractsDir = resolve(currentDir, "..", "..", "shared", "contracts", "midnight");

export interface ThirdPartyMintResult {
  amount: string;
  /** Error text of the call without a mapping (expected to mention the encryption key). */
  unmappedError?: string;
  txHash?: string;
  confirmed: boolean;
  /** Shielded balances of the fresh recipient wallet after the mint. */
  recipientBalances?: Record<string, string>;
  error?: string;
}

const errorText = (e: unknown): string =>
  e instanceof Error ? `${e.message}${e.cause ? ` (cause: ${String(e.cause)})` : ""}` : String(e);

function waitForShieldedBalance(
  walletResult: WalletResult,
  amount: bigint,
  timeoutMs: number,
): Promise<Record<string, bigint>> {
  return new Promise((resolvePromise, reject) => {
    let subscription: { unsubscribe(): void } | undefined;
    const timer = setTimeout(() => {
      subscription?.unsubscribe();
      reject(new Error(`recipient did not see a shielded coin of ${amount} within ${timeoutMs} ms`));
    }, timeoutMs);
    subscription = (walletResult.wallet as any).state().subscribe({
      next: (state: any) => {
        const balances: Record<string, bigint> = state?.shielded?.balances ?? {};
        if (Object.values(balances).some((value) => value === amount)) {
          clearTimeout(timer);
          queueMicrotask(() => subscription?.unsubscribe());
          resolvePromise(balances);
        }
      },
      error: (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    });
  });
}

function mintInput(
  recipientCoinPublicKey: string,
  nonce: bigint,
  timestamp: string,
  mappings?: Array<[string, string]>,
): DefaultBatcherInput {
  return {
    address: "e2e-third-party-mint",
    addressType: 0,
    timestamp,
    input: JSON.stringify({
      circuit: "mint_shielded_to",
      args: [
        { is_left: true, left: { bytes: recipientCoinPublicKey }, right: { bytes: "00".repeat(32) } },
        DOMAIN_SEP_HEX,
        MINT_AMOUNT.toString(),
        nonce.toString(),
      ],
      ...(mappings ? { coinEncPublicKeyMappings: mappings } : {}),
    }),
  } as DefaultBatcherInput;
}

async function submitOne(
  adapter: MidnightAdapter<unknown>,
  input: DefaultBatcherInput,
): Promise<string> {
  const validation = adapter.validateInput(input);
  if (!validation.valid) throw new Error(`input rejected: ${validation.error}`);
  const built = adapter.buildBatchData([input]);
  if (!built?.data) throw new Error("adapter built no batch");
  try {
    return await adapter.submitBatch(built.data);
  } finally {
    adapter.releaseBatchResources(built.data);
  }
}

export async function runThirdPartyShieldedMint(): Promise<ThirdPartyMintResult> {
  const result: ThirdPartyMintResult = { amount: MINT_AMOUNT.toString(), confirmed: false };
  const networkId = midnightNetworkConfig.id;
  const networkUrls = {
    id: networkId,
    indexer: midnightNetworkConfig.indexer,
    indexerWS: midnightNetworkConfig.indexerWS,
    node: midnightNetworkConfig.node,
    proofServer: midnightNetworkConfig.proofServer,
  };
  let minterWallet: WalletResult | undefined;
  let recipientWallet: WalletResult | undefined;
  let adapter: MidnightAdapter<unknown> | undefined;

  try {
    const { contractInfo, contractAddress, zkConfigPath } = readMidnightContract(
      "contract-counter",
      { baseDir: midnightContractsDir, networkId },
    );
    console.log(`${TAG} counter contract ${contractAddress}`);

    // The recipient: a fresh wallet that only needs to sync, not to pay.
    recipientWallet = await buildWalletFacade(networkUrls, randomBytes(32).toString("hex"), networkId);
    const recipientAddress = formatShieldedAddress(
      {
        coinPublicKey: String(recipientWallet.zswapSecretKeys.coinPublicKey),
        encryptionPublicKey: String(recipientWallet.zswapSecretKeys.encryptionPublicKey),
      },
      networkId,
    );
    const mapping = shieldedAddressToCoinEncPublicKeyMapping(recipientAddress, networkId);
    console.log(`${TAG} recipient ${recipientAddress}`);

    // The minter pays DUST fees with the genesis wallet, as the other triggers do.
    minterWallet = await buildWalletFacade(networkUrls, midnightNetworkConfig.walletSeed, networkId);
    await syncAndWaitForFunds(minterWallet.wallet);
    // The genesis wallet holds DUST from genesis. Wait for spendable DUST the
    // way MidnightAdapter.ensureWalletFunds does. registerNightForDust is not a
    // usable check here: by this phase trigger-token-mints has minted a custom
    // unshielded token to this wallet, and registerNightForDust treats every
    // unregistered unshielded UTXO as NIGHT, so its registration fails with
    // "Token of a non-Night type received" and it returns false.
    let dustReady = false;
    try {
      dustReady = (await waitForDustFunds(minterWallet.wallet, {
        timeoutMs: 180_000,
        waitNonZero: true,
      })).ready;
    } catch {
      dustReady = false;
    }
    if (!dustReady) {
      throw new Error("minter wallet has no spendable DUST");
    }

    adapter = new MidnightAdapter(
      contractAddress,
      midnightNetworkConfig.walletSeed,
      {
        indexer: networkUrls.indexer,
        indexerWS: networkUrls.indexerWS,
        node: networkUrls.node,
        proofServer: networkUrls.proofServer,
        zkConfigPath,
        contractName: "contract-counter",
        privateStateStoreName: "counter-third-party-mint-private-state",
        privateStateId: "counterPrivateState",
        walletNetworkId: networkId,
        walletResult: minterWallet,
        callTxTimeoutSeconds: 240,
      },
      Counter.Contract,
      witnesses,
      contractInfo as any,
      "e2e-third-party-mint",
    );

    // 1. No mapping: midnight-js cannot encrypt the recipient's output.
    try {
      const unexpected = await submitOne(
        adapter,
        mintInput(mapping[0], BigInt(Date.now()), `${Date.now()}-unmapped`),
      );
      result.unmappedError = `unexpectedly submitted ${unexpected}`;
    } catch (error) {
      result.unmappedError = errorText(error);
    }
    console.log(`${TAG} without mapping: ${result.unmappedError}`);

    // 2. With the mapping: the mint lands and the recipient sees the coin.
    const txHash = await submitOne(
      adapter,
      mintInput(mapping[0], BigInt(Date.now()) + 1n, `${Date.now()}-mapped`, [mapping]),
    );
    result.txHash = txHash;
    const receipt = await adapter.waitForTransactionReceipt(txHash, 180_000);
    result.confirmed = receipt.status === 1;
    console.log(`${TAG} mapped mint ${txHash} confirmed in block ${receipt.blockNumber}`);

    const balances = await waitForShieldedBalance(recipientWallet, MINT_AMOUNT, RECIPIENT_SYNC_TIMEOUT_MS);
    result.recipientBalances = Object.fromEntries(
      Object.entries(balances).map(([color, value]) => [color, value.toString()]),
    );
    console.log(`${TAG} recipient balances ${JSON.stringify(result.recipientBalances)}`);
  } catch (error) {
    result.error = errorText(error);
    console.error(`${TAG} failed: ${result.error}`);
  } finally {
    // The adapter's cleanup stops the minter wallet it was given.
    if (adapter) await adapter.cleanup().catch(() => {});
    else await (minterWallet?.wallet as any)?.stop?.().catch(() => {});
    await (recipientWallet?.wallet as any)?.stop?.().catch(() => {});
  }
  return result;
}
