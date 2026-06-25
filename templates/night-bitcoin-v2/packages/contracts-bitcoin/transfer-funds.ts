import { faucetBtc } from "./faucet-btc.ts";

/**
 *  This script transfers BTC to a specified address.
 *  Usage:
 *  FROM_ADDRESS=... TO_ADDRESS=bcrt1q... AMOUNT=1000000000 bun run transfer-funds.ts
 *
 *  Environment variables:
 *  - FROM_ADDRESS: From address [ NOT USED ]
 *  - TO_ADDRESS: To address
 *  - AMOUNT: Amount in satoshis
 */

export async function transferFunds(
    fromAddress: string | undefined,
    toAddress: string | undefined,
    amount: string | undefined,
): Promise<void> {
    if (!fromAddress || !toAddress || !amount) {
        console.error("FROM_ADDRESS, TO_ADDRESS, and AMOUNT environment variables are not set");
        process.exit(1);
    }

    console.log("================================================");
    console.log("Transferring (BITCOIN) funds to", toAddress, "amount", amount);
    console.log({ toAddress, amount });
    console.log("================================================");

    // amount is in satoshis. convert to btc.
    const amountBtc = parseInt(amount || '0', 10) / 100000000;
    await faucetBtc({ address: toAddress! }, amountBtc);
}

if (import.meta.main) {
    const fromAddress = process.env.FROM_ADDRESS;
    const toAddress = process.env.TO_ADDRESS;
    const amount = process.env.AMOUNT;
    await transferFunds(fromAddress, toAddress, amount);
}
