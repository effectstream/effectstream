/**
 * ERC721 Sync Test
 *
 * Flow: mint token#501 to wallet0 -> transfer to wallet1
 *       -> sync indexes Transfer events
 *       -> IVM updates erc721_ownership_view
 *       -> test checks: token#501 owned by wallet1
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

const erc721Abi = [
  { inputs: [{ name: "_to", type: "address" }, { name: "_tokenId", type: "uint256" }], name: "mint", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], name: "transferFrom", outputs: [], stateMutability: "nonpayable", type: "function" },
] as const;

function getClients(pk: `0x${string}`) {
  const account = privateKeyToAccount(pk);
  return { walletClient: createWalletClient({ account, chain: hardhat, transport: http() }), publicClient: createPublicClient({ chain: hardhat, transport: http() }) };
}

export async function erc721SyncTest(db: Client, sharedState: SharedState) {
  const addresses = contractAddressesEvmMain();
  const erc721Address = addresses.chain31337["Erc721DevModule#Erc721Dev"];
  const { walletClient: wc0, publicClient: pc0 } = getClients(wallets[0].privateKey);

  // Mint token#501 to wallet0
  const h1 = await wc0.writeContract({ address: erc721Address, abi: erc721Abi, functionName: "mint", args: [wallets[0].address, 501n] });
  await pc0.waitForTransactionReceipt({ hash: h1 });
  sharedState.primitive_accounting_counter += 1;

  // Transfer token#501 to wallet1
  const h2 = await wc0.writeContract({ address: erc721Address, abi: erc721Abi, functionName: "transferFrom", args: [wallets[0].address, wallets[1].address, 501n] });
  await pc0.waitForTransactionReceipt({ hash: h2 });
  sharedState.primitive_accounting_counter += 1;

  // Check IVM: token#501 owned by wallet1
  await assertSQL<{ token_id: string; current_owner: string }>(
    "ERC721: IVM shows token#501 owned by wallet1",
    db,
    `SELECT token_id, current_owner FROM primitives.erc721_ownership_view_arbitrum_erc721
     WHERE token_id = '501';`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0].current_owner.toLowerCase() === wallets[1].address.toLowerCase(),
  );

  // Check STM custom table: erc721_transfers has both records
  await assertSQL<{ from_addr: string; to_addr: string; token_id: string }>(
    "ERC721: STM wrote erc721_transfers (mint + transfer)",
    db,
    `SELECT from_addr, to_addr, token_id FROM erc721_transfers ORDER BY id ASC;`,
    (res) => res.rows.length >= 2,
    (res) => {
      const mint = res.rows[0];
      const transfer = res.rows[1];
      return mint.from_addr === "0x0000000000000000000000000000000000000000"
          && mint.token_id === "501"
          && transfer.to_addr.toLowerCase() === wallets[1].address.toLowerCase()
          && transfer.token_id === "501";
    },
  );
}
