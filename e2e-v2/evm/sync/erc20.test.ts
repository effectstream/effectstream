/**
 * ERC20 Sync Test
 *
 * Flow: mint 500 to wallet0 -> transfer 200 to wallet1
 *       -> sync indexes Transfer events
 *       -> IVM updates erc20_balances_view with correct balances
 *       -> test checks: wallet0=300, wallet1=200
 */
import { assertSQL, type SharedState } from "@e2e-v2/engine";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@e2e-v2/evm-contracts";
import type { Client } from "pg";

const wallets = [
  { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`, privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}` },
  { address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`, privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as `0x${string}` },
];

const erc20Abi = [
  { inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], name: "mint", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], name: "transfer", outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable", type: "function" },
] as const;

function getClients(pk: `0x${string}`) {
  const account = privateKeyToAccount(pk);
  return { walletClient: createWalletClient({ account, chain: hardhat, transport: http() }), publicClient: createPublicClient({ chain: hardhat, transport: http() }) };
}

export async function erc20SyncTest(db: Client, sharedState: SharedState) {
  const addresses = contractAddressesEvmMain();
  const erc20Address = addresses.chain31337["PaimaErc20DevModule#PaimaErc20Dev"];
  const { walletClient, publicClient } = getClients(wallets[0].privateKey);
  const m = 10n ** 18n;

  // Mint 500 to wallet0
  const h1 = await walletClient.writeContract({ address: erc20Address, abi: erc20Abi, functionName: "mint", args: [wallets[0].address, 500n * m] });
  await publicClient.waitForTransactionReceipt({ hash: h1 });
  sharedState.primitive_accounting_counter += 1;

  // Transfer 200 from wallet0 to wallet1
  const h2 = await walletClient.writeContract({ address: erc20Address, abi: erc20Abi, functionName: "transfer", args: [wallets[1].address, 200n * m] });
  await publicClient.waitForTransactionReceipt({ hash: h2 });
  sharedState.primitive_accounting_counter += 1;

  // Check IVM: wallet0 should have 300, wallet1 should have 200
  await assertSQL<{ address: string; balance: string }>(
    "ERC20: IVM balances wallet0=300e18, wallet1=200e18",
    db,
    `SELECT address, balance FROM primitives.erc20_balances_view_aribitrum_token ORDER BY address;`,
    (res) => res.rows.length >= 2,
    (res) => {
      const w0 = res.rows.find((r: any) => r.address === wallets[0].address.toLowerCase());
      const w1 = res.rows.find((r: any) => r.address === wallets[1].address.toLowerCase());
      return w0 != null && w0.balance === String(300n * m)
          && w1 != null && w1.balance === String(200n * m);
    },
  );

  // Check STM custom table: erc20_transfers has both transfer records
  await assertSQL<{ from_addr: string; to_addr: string; value: string }>(
    "ERC20: STM wrote erc20_transfers (mint + transfer)",
    db,
    `SELECT from_addr, to_addr, value FROM erc20_transfers ORDER BY id ASC;`,
    (res) => res.rows.length >= 2,
    (res) => {
      const mint = res.rows[0];
      const transfer = res.rows[1];
      return mint.from_addr === "0x0000000000000000000000000000000000000000"
          && mint.to_addr.toLowerCase() === wallets[0].address.toLowerCase()
          && transfer.from_addr.toLowerCase() === wallets[0].address.toLowerCase()
          && transfer.to_addr.toLowerCase() === wallets[1].address.toLowerCase()
          && transfer.value === String(200n * m);
    },
  );
}
