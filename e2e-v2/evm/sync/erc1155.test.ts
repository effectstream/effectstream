/**
 * ERC1155 Sync Test
 *
 * Tests: mint, safeTransferFrom (single), safeBatchTransferFrom
 * Checks: IVM ownership view + STM custom table erc1155_transfers
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
  { address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as `0x${string}`, privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as `0x${string}` },
];

const erc1155Abi = [
  { inputs: [{ name: "_to", type: "address" }, { name: "_amount", type: "uint256" }, { name: "_tokenId", type: "uint256" }, { name: "_data", type: "bytes" }], name: "mint", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "id", type: "uint256" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }], name: "safeTransferFrom", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "ids", type: "uint256[]" }, { name: "values", type: "uint256[]" }, { name: "data", type: "bytes" }], name: "safeBatchTransferFrom", outputs: [], stateMutability: "nonpayable", type: "function" },
] as const;

function getClients(pk: `0x${string}`) {
  const account = privateKeyToAccount(pk);
  return { walletClient: createWalletClient({ account, chain: hardhat, transport: http() }), publicClient: createPublicClient({ chain: hardhat, transport: http() }) };
}

export async function erc1155SyncTest(db: Client, sharedState: SharedState) {
  const addresses = contractAddressesEvmMain();
  const addr = addresses.chain31337["Erc1155DevModule#ERC1155Dev"];
  const { walletClient: wc0, publicClient: pc0 } = getClients(wallets[0].privateKey);
  const { walletClient: wc1, publicClient: pc1 } = getClients(wallets[1].privateKey);

  // Mint 100 of token#10 to wallet0, 200 of token#11 to wallet1
  let h = await wc0.writeContract({ address: addr, abi: erc1155Abi, functionName: "mint", args: [wallets[0].address, 100n, 10n, "0x"] });
  await pc0.waitForTransactionReceipt({ hash: h });
  sharedState.primitive_accounting_counter += 1;

  h = await wc1.writeContract({ address: addr, abi: erc1155Abi, functionName: "mint", args: [wallets[1].address, 200n, 11n, "0x"] });
  await pc1.waitForTransactionReceipt({ hash: h });
  sharedState.primitive_accounting_counter += 1;

  // Single transfer: 40 of token#10 from wallet0 -> wallet2
  h = await wc0.writeContract({ address: addr, abi: erc1155Abi, functionName: "safeTransferFrom", args: [wallets[0].address, wallets[2].address, 10n, 40n, "0x"] });
  await pc0.waitForTransactionReceipt({ hash: h });
  sharedState.primitive_accounting_counter += 1;

  // Batch transfer: [50 of token#11] from wallet1 -> wallet2
  h = await wc1.writeContract({ address: addr, abi: erc1155Abi, functionName: "safeBatchTransferFrom", args: [wallets[1].address, wallets[2].address, [11n], [50n], "0x"] });
  await pc1.waitForTransactionReceipt({ hash: h });
  // BatchTransfer emits one event per token in the batch
  sharedState.primitive_accounting_counter += 1;

  // Check IVM ownership view
  // Expected: wallet0=60 of #10, wallet1=150 of #11, wallet2=40 of #10 + 50 of #11
  await assertSQL<{ owner_address: string; token_id: string; amount: string }>(
    "ERC1155: IVM balances after mint+single+batch transfer",
    db,
    `SELECT owner_address, token_id, amount FROM primitives.erc1155_ownership_view_l1_erc1155_token
     ORDER BY token_id, owner_address;`,
    (res) => res.rows.length >= 4,
    (res) => {
      const find = (token: string, wallet: string) =>
        res.rows.find((r: any) => r.token_id === token && r.owner_address.toLowerCase() === wallet.toLowerCase());
      const w0_t10 = find("10", wallets[0].address);
      const w2_t10 = find("10", wallets[2].address);
      const w1_t11 = find("11", wallets[1].address);
      const w2_t11 = find("11", wallets[2].address);
      return w0_t10 != null && BigInt(w0_t10.amount) === 60n
          && w2_t10 != null && BigInt(w2_t10.amount) === 40n
          && w1_t11 != null && BigInt(w1_t11.amount) === 150n
          && w2_t11 != null && BigInt(w2_t11.amount) === 50n;
    },
  );

  // Check STM custom table: erc1155_transfers has mint + single transfer entries
  await assertSQL<{ from_addr: string; to_addr: string; token_id: string; amount: string }>(
    "ERC1155: STM wrote erc1155_transfers (mints + transfers)",
    db,
    `SELECT from_addr, to_addr, token_id, amount FROM erc1155_transfers ORDER BY id ASC;`,
    (res) => res.rows.length >= 3,
    (res) => {
      // At minimum: 2 mints + 1 single transfer (batch may produce separate entries)
      const mint1 = res.rows[0];
      return mint1.from_addr === "0x0000000000000000000000000000000000000000"
          && mint1.token_id === "10"
          && mint1.amount === "100";
    },
  );
}
