import { WalletBuilder } from '@midnight-ntwrk/wallet';
import { NetworkId } from '@midnight-ntwrk/zswap';
import { firstValueFrom } from 'rxjs';
import { joinAndMint } from './faucet-unshielded-erc20.ts';
import { type WalletState } from '@midnight-ntwrk/wallet-api';
import * as path from "node:path";
import { generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { faucet } from './faucet.ts';

const DEFAULT_SEED_PREFIX = "97be3ee35553d827846c1490bcc571f8a29ffd448912b9f023a7b177de7877c";

async function createWallet(seed: string): Promise<WalletState> {
    let seedString = seed;
    if (seed) {
        seedString = seed;
    } else {
        const seedArray = generateRandomSeed();
        const seedBuffer = Buffer.from(seedArray).toString('hex');
        seedString = seedBuffer.toString();
    }

    const wallet = await WalletBuilder.build(
        'http://localhost:8088/api/v1/graphql', // Indexer URL
        'ws://localhost:8088/api/v1/graphql/ws', // Indexer WebSocket URL
        'http://localhost:6300', // Proving Server URL
        'http://localhost:9944', // Node URL
        seedString,
        NetworkId.Undeployed,
        'error' // LogLevel (optional)
    );

    wallet.start();
    const data = await firstValueFrom(wallet.state())
    await wallet.close();
    return { ...data, seed: seedString } as WalletState;
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
            Deno.writeTextFileSync(outputPath, JSON.stringify(wallet, null, 2));
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
        await joinAndMint(wallets.map(wallet => wallet.address), 250000000000000n);
        await faucet(wallets.map(wallet => wallet.address));
    }
}