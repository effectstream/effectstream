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
      "Undeployed" as any
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
    switch (Deno.args[0]) {
        case 'ONLY_CREATE':
            mint = false;
            break;
        case 'ONLY_MINT':
            create = false;
            break;
    }
    const numberOfWallets = 3;
    const wallets: WalletState[] = [];
    if (create) {
        const currentDir = Deno.cwd();
        await Deno.mkdir(path.join(currentDir, "generated"), { recursive: true });

        for (let i = 0; i < numberOfWallets; i++) {
            const wallet = await createWallet(DEFAULT_SEED_PREFIX + i.toString());

            const outputPath = path.join(currentDir, "generated", `wallet-${i}.json`);
            Deno.writeTextFileSync(outputPath, JSON.stringify(wallet, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
            console.log(`Wallet saved to ${outputPath}`);

            wallets.push(wallet);
        }
    } else {
        const currentDir = Deno.cwd();
        const files = Array(numberOfWallets).fill(0).map((_, i) => path.join(currentDir, "generated", `wallet-${i}.json`));
        for (const file of files) {
            const wallet = JSON.parse(await Deno.readTextFile(file)) as WalletState;
            wallets.push(wallet);
        }
        console.log(`Loaded ${wallets.length} wallets from ${currentDir}/generated`);
        if (!wallets.length) {
            console.error('No wallets found');
            Deno.exit(1);
        }
    }
    if (mint) {
        const { faucet } = await import('./faucet.ts');
        const { joinAndMint } = await import('./faucet-unshielded-erc20.ts');
        // ERC20 minting uses shielded address (contract extracts coinPublicKey)
        await joinAndMint(wallets.map(wallet => wallet.shieldedAddress), 250000000000000n);
        // NIGHT token transfer uses unshielded address (bech32m format)
        await faucet(wallets.map(wallet => wallet.unshieldedAddress));
    }
}
