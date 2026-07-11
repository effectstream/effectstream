// Dev-time Midnight "transfer funds" helper.
//
// In v1 this called the old unshielded-erc20 contract's `mint` circuit to
// hand M20 to a recipient. The new unshielded-mint contract has no transfer
// circuit and minting requires the deployed contract + wallet + zk config,
// which is wired up in the filler's embedded batcher.
//
// Rather than reimplement that whole stack here (state-machine.ts only uses
// this for a dev-only "pay filler back" simulation), this is now a noop with
// a log. Real M20 movements happen through the filler→batcher→mint_unshielded
// path.

export async function transferFunds(
  fromAddress: string | undefined,
  toAddress: string | undefined,
  amount: string | undefined,
): Promise<void> {
  console.warn(
    "[transferFunds:midnight] noop — M20 is now native unshielded; settle via filler/batcher",
    { fromAddress, toAddress, amount },
  );
}

if (import.meta.main) {
  const fromAddress = process.env.FROM_ADDRESS;
  const toAddress = process.env.TO_ADDRESS;
  const amount = process.env.AMOUNT;
  await transferFunds(fromAddress, toAddress, amount);
}
