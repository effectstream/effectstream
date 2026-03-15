import { faucetBtc } from "./faucet-btc.ts";

/**
 *  This script transfers BTC to a specified address.
 *  Usage:
 *  deno run -A transfer-funds.ts bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03 10
 * 
 *  Arguments:
 *  - 1. From address [ NOT USED ]
 *  - 2. To address
 *  - 3. Amount in satoshis
 */

export async function transferFunds(
    fromAddress: string | undefined,
    toAddress: string | undefined,
    amount: string | undefined,
): Promise<void> {
    if (!fromAddress || !toAddress || !amount) {
        console.error("❌ FROM_ADDRESS, TO_ADDRESS, and AMOUNT environment variables are not set");
        process.exit(1);
    }

    console.log("================================================");
    console.log("🔑 Transferring (BITCOIN) funds to", toAddress, "amount", amount);
    console.log({ toAddress, amount });
    console.log("================================================");

    // amount is in satoshis.
    // convert to btc.
    const amountBtc = parseInt(amount || '0', 10) / 100000000;
    faucetBtc({ address: toAddress! }, amountBtc);
};

if (import.meta.main) {
    const fromAddress = process.env.FROM_ADDRESS;
    const toAddress = process.env.TO_ADDRESS;
    const amount = process.env.AMOUNT;
    await transferFunds(fromAddress, toAddress, amount);
}