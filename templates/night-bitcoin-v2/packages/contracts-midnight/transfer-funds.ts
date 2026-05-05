import { joinAndMint } from "./faucet-unshielded-erc20.ts";

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
    console.log("🔑 Transferring (MIDNIGHT) funds to", toAddress, "amount", amount);
    console.log({ fromAddress, toAddress, amount });
    console.log("================================================");

    await joinAndMint(toAddress!, BigInt(amount!));
};

if (import.meta.main) {
    const fromAddress = process.env.FROM_ADDRESS;
    const toAddress = process.env.TO_ADDRESS;
    const amount = process.env.AMOUNT;
    await transferFunds(fromAddress, toAddress, amount);
}