/**
 * Multi-chain Sync Test
 *
 * Flow: mint ERC20 on chain 31338 -> IVM updates ETH_L1_ERC20 balance view
 *       mint ERC721 on chain 31338 -> IVM updates L1_ERC721_Token ownership view
 */
import { assertSQL, type SharedState } from "@e2e/engine";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@e2e/evm-contracts";
import type { Client } from "pg";

const wallets = [
  { address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as `0x${string}`, privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as `0x${string}` },
];

const chain31338 = {
  ...hardhat,
  id: 31338 as const,
  name: "Hardhat Parallel" as const,
  rpcUrls: { default: { http: ["http://127.0.0.1:8546"] } },
} as const;

const erc20Abi = [
  { inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], name: "mint", outputs: [], stateMutability: "nonpayable", type: "function" },
] as const;
const erc721Abi = [
  { inputs: [{ name: "_to", type: "address" }, { name: "_tokenId", type: "uint256" }], name: "mint", outputs: [], stateMutability: "nonpayable", type: "function" },
] as const;

export async function multiChainSyncTest(db: Client, sharedState: SharedState) {
  const addresses = contractAddressesEvmMain();
  const account = privateKeyToAccount(wallets[0].privateKey);
  const wc = createWalletClient({ account, chain: chain31338, transport: http() });
  const pc = createPublicClient({ chain: chain31338, transport: http() });

  // Mint 750 ERC20 on chain 31338
  const h1 = await wc.writeContract({ address: addresses.chain31338["EffectstreamErc20DevModule#EffectstreamErc20Dev"], abi: erc20Abi, functionName: "mint", args: [wallets[0].address, 750n * 10n ** 18n] });
  await pc.waitForTransactionReceipt({ hash: h1 });
  sharedState.primitive_accounting_counter += 1;

  // Mint ERC721 token#601 on chain 31338
  const h2 = await wc.writeContract({ address: addresses.chain31338["Erc721DevModule#Erc721Dev"], abi: erc721Abi, functionName: "mint", args: [wallets[0].address, 601n] });
  await pc.waitForTransactionReceipt({ hash: h2 });
  sharedState.primitive_accounting_counter += 1;

  // Chain 31338 has delayMs=1000 + confirmationDepth=2, wait longer
  await assertSQL<{ address: string; balance: string }>(
    "Multi-chain: ERC20 IVM on chain 31338 shows wallet0=750e18",
    db,
    `SELECT address, balance FROM primitives.erc20_balances_view_eth_l1_erc20;`,
    (res) => res.rows.length >= 1,
    (res) => {
      const w0 = res.rows.find((r: any) => r.address === wallets[0].address.toLowerCase());
      return w0 != null && w0.balance === String(750n * 10n ** 18n);
    },
  );

  await assertSQL<{ token_id: string; current_owner: string }>(
    "Multi-chain: ERC721 IVM on chain 31338 shows token#601 owned by wallet0",
    db,
    `SELECT token_id, current_owner FROM primitives.erc721_ownership_view_l1_erc721_token
     WHERE token_id = '601';`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0].current_owner.toLowerCase() === wallets[0].address.toLowerCase(),
  );
}
