import { MidnightBech32m } from "@midnight-ntwrk/wallet-sdk-address-format";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { OfferFilesContract, witnesses } from "../midnight-contracts/contract-offer-files/src/index.ts";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { dirname } from "node:path";
import {
    findDeployedContract,
    type FoundContract,
} from "@midnight-ntwrk/midnight-js-contracts";
import {
    buildWalletAndWaitForFunds,
    configureMidnightNodeProviders,
} from "@effectstream/midnight-contracts";

import { midnightContract } from "./config.ts";

// ─── Pre-configured wallet seeds ────────────────────────────────────────────

const WALLET_SEEDS: Record<string, string> = {
    alice:
        midnightNetworkConfig.walletSeed ??
        "0000000000000000000000000000000000000000000000000000000000000001",
    bob: "0000000000000000000000000000000000000000000000000000000000000002",
};

// ─── Per-wallet instances ───────────────────────────────────────────────────

interface WalletEntry {
    walletResult: any;
    bech32: string;
    contract: any;
}

const _wallets = new Map<string, WalletEntry>();
const _initPromises = new Map<string, Promise<WalletEntry>>();

export function getAvailableWallets(): string[] {
    return Object.keys(WALLET_SEEDS);
}

export function resolveWalletId(raw?: string): string {
    const id = (raw ?? "alice").toLowerCase();
    if (!WALLET_SEEDS[id]) {
        throw new Error(`Unknown wallet "${id}". Available: ${getAvailableWallets().join(", ")}`);
    }
    return id;
}

export async function getWalletInstance(walletId = "alice") {
    const id = resolveWalletId(walletId);
    const entry = await getOrInitWallet(id);
    return { walletResult: entry.walletResult, wallet2Bech32: entry.bech32 };
}

export async function getContractInstance(walletId = "alice") {
    const id = resolveWalletId(walletId);
    const entry = await getOrInitWallet(id);
    return entry.contract;
}

// ─── Lazy per-wallet initialization ─────────────────────────────────────────

async function getOrInitWallet(id: string): Promise<WalletEntry> {
    const existing = _wallets.get(id);
    if (existing) return existing;

    // Deduplicate concurrent init calls for the same wallet
    let pending = _initPromises.get(id);
    if (!pending) {
        pending = initWallet(id);
        _initPromises.set(id, pending);
    }

    const entry = await pending;
    _wallets.set(id, entry);
    _initPromises.delete(id);
    return entry;
}

async function initWallet(id: string): Promise<WalletEntry> {
    const seed = WALLET_SEEDS[id];
    console.log(`[WALLET] Initializing wallet "${id}"...`);

    setNetworkId(midnightNetworkConfig.id);

    const networkUrls = {
        indexer: midnightNetworkConfig.indexer,
        indexerWS: midnightNetworkConfig.indexerWS,
        node: midnightNetworkConfig.node,
        proofServer: midnightNetworkConfig.proofServer,
        id: midnightNetworkConfig.id,
    };

    const walletResult = await buildWalletAndWaitForFunds(
        networkUrls,
        seed,
        midnightNetworkConfig.id,
    );

    const addr = await walletResult.wallet.shielded.getAddress();
    const bech32 = MidnightBech32m.encode(midnightNetworkConfig.id, addr).asString();

    const privateStateId = `offerFilesPrivateState_${id}`;

    const providers = configureMidnightNodeProviders(
        walletResult.wallet,
        walletResult.zswapSecretKeys,
        walletResult.walletZswapSecretKeys,
        walletResult.dustSecretKey,
        walletResult.walletDustSecretKey,
        networkUrls,
        privateStateId,
        midnightContract!.zkConfigPath,
        walletResult.unshieldedKeystore,
    );

    const compiledContract = CompiledContract.make(
        "contract-offer-files",
        OfferFilesContract.Contract as any,
    ).pipe(
        CompiledContract.withWitnesses(witnesses as unknown as never),
        CompiledContract.withCompiledFileAssets(
            dirname(midnightContract!.zkConfigPath),
        ),
    );

    const contract = await findDeployedContract(
        providers,
        {
            contractAddress: midnightContract!.contractAddress,
            compiledContract: compiledContract as any,
            privateStateId,
            initialPrivateState: {},
        },
    ) as any;

    console.log(`[WALLET] Wallet "${id}" ready (${bech32.slice(0, 20)}...)`);

    return { walletResult, bech32, contract };
}
