import { buildWalletFacade, type WalletResult } from './faucet.ts';
import { generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import * as path from "node:path";
import { Buffer } from "node:buffer";

/**
 * LEDGER 6 PARADIGM:
 * - Wallets receive unshielded NIGHT tokens (not dust directly)
 * - Addresses must be in bech32m format (mn_addr_undeployed1...) for unshielded transfers
 * - Wallets must register their unshielded NIGHT UTXOs to generate dust for transaction fees
 * - Dust is no longer transferable directly; it's generated from registered NIGHT tokens
 */

const DEFAULT_SEED_PREFIX = "97be3ee35553d827846c1490bcc571f8a29ffd448912b9f023a7b177de7877c";

interface WalletState {
  seed: string;
  shieldedAddress: string;  // mn_shield-addr_undeployed1... (for ERC20 minting - uses coinPublicKey)
  unshieldedAddress: string; // mn_addr_undeployed1... (for NIGHT token transfers)
}

async function createWallet(seed: string): Promise<WalletState> {
    let seedString = seed;
    if (seed) {
        seedString = seed;
    } else {
        const seedArray = generateRandomSeed();
        const seedBuffer = Buffer.from(seedArray).toString('hex');
        seedString = seedBuffer.toString();
    }

    const networkUrls = {
      indexer: "http://localhost:8088/api/v3/graphql",
      indexerWS: "ws://localhost:8088/api/v3/graphql/ws",
      node: "http://localhost:9944",
      proofServer: "http://localhost:6300",
    };

    const walletResult = await buildWalletFacade(
      networkUrls,
      seedString,
      "undeployed" as any
    );

    const initialState = await (await import('./faucet.ts')).getInitialShieldedState(walletResult.wallet.shielded);

    // Store both addresses for different purposes in Ledger 6:
    // - shieldedAddress: for ERC20 minting (contract extracts coinPublicKey from it)
    // - unshieldedAddress: for NIGHT token transfers (requires bech32m unshielded format)
    const walletState: WalletState = {
      seed: seedString,
      // The address object should have asString() method to get bech32m format
      shieldedAddress: (initialState.address as any).asString?.() || 
                       `${initialState.address.coinPublicKeyString()}_${initialState.address.encryptionPublicKeyString()}`,
      unshieldedAddress: walletResult.unshieldedAddress
    };

    await walletResult.wallet.stop();

    return walletState;
}

if (import.meta.main) {
    let create = true;
    let mint = true;
    switch (process.argv[2]) {
        case 'ONLY_CREATE':
            mint = false;
            break;
        case 'ONLY_MINT':
            create = false;
            break;
    }
    const numberOfWallets = 3;
    const wallets: WalletState[] = [];
    const { mkdir, readFile } = await import("node:fs/promises");
    const { writeFileSync } = await import("node:fs");
    if (create) {
        const currentDir = process.cwd();
        await mkdir(path.join(currentDir, "generated"), { recursive: true });

        for (let i = 0; i < numberOfWallets; i++) {
            const wallet = await createWallet(DEFAULT_SEED_PREFIX + i.toString());

            const outputPath = path.join(currentDir, "generated", `wallet-${i}.json`);
            writeFileSync(outputPath, JSON.stringify(wallet, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
            console.log(`Wallet saved to ${outputPath}`);

            wallets.push(wallet);
        }
    } else {
        const currentDir = process.cwd();
        const files = Array(numberOfWallets).fill(0).map((_, i) => path.join(currentDir, "generated", `wallet-${i}.json`));
        for (const file of files) {
            const wallet = JSON.parse(await readFile(file, "utf-8")) as WalletState;
            wallets.push(wallet);
        }
        console.log(`Loaded ${wallets.length} wallets from ${currentDir}/generated`);
        if (!wallets.length) {
            console.error('No wallets found');
            process.exit(1);
        }
    }
    if (mint) {
        // Filler wallets only need NIGHTs (for dust gas fees) — they no longer
        // need pre-minted M20. Under the new contract, M20 is created fresh
        // per fill via mint_unshielded(domainSep, amount, userAddress); the
        // filler holds no M20 balance of its own.
        const { faucet } = await import('./faucet.ts');
        const unshieldedTargets = wallets.map(wallet => wallet.unshieldedAddress);
        await faucet(unshieldedTargets);
        console.log("✅ NIGHT transfers completed. Exiting.");
        process.exit(0);
    }
}
