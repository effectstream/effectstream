

export async function transferFunds(
    fromAddress: string | undefined,
    toAddress: string | undefined,
    amount: string | undefined,
): Promise<void> {
    if (!fromAddress || !toAddress || !amount) {
    console.error("❌ FROM_ADDRESS, TO_ADDRESS, and AMOUNT environment variables are not set");
    Deno.exit(1);
    }

    console.log("================================================");
    console.log("🔑 Transferring (BITCOIN) funds from", fromAddress, "to", toAddress, "amount", amount);
    console.log({ fromAddress, toAddress, amount });
    console.log("================================================");
};

if (import.meta.main) {
    const fromAddress = Deno.env.get("FROM_ADDRESS");
    const toAddress = Deno.env.get("TO_ADDRESS");
    const amount = Deno.env.get("AMOUNT");
    await transferFunds(fromAddress, toAddress, amount);
}