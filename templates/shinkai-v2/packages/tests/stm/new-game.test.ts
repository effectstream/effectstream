import { assertSQL } from "../helpers.ts";
import { createWalletClient, createPublicClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { contractAddressesEvmMain } from "@shinkai-v2/contracts-evm";
import type { Client } from "pg";

const wallet0 = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);

const effectstreamL2Abi = [{
  inputs: [{ name: "data", type: "bytes" }],
  name: "effectstreamSubmitGameInput",
  outputs: [],
  stateMutability: "payable",
  type: "function",
}] as const;

export async function newGameTest(db: Client) {
  const addresses = contractAddressesEvmMain();
  const contractAddr = addresses.chain31337["EffectstreamL2Module#MyEffectstreamL2"];
  const walletClient = createWalletClient({ account: wallet0, chain: hardhat, transport: http() });
  const publicClient = createPublicClient({ chain: hardhat, transport: http() });

  const hash = await walletClient.writeContract({
    address: contractAddr,
    abi: effectstreamL2Abi,
    functionName: "effectstreamSubmitGameInput",
    args: [toHex(JSON.stringify(["newGame"]))],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  await assertSQL(
    "newGame: game row created for wallet",
    db,
    `SELECT * FROM game WHERE wallet = '${wallet0.address.toLowerCase()}' AND stage = 'new';`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0].wallet === wallet0.address.toLowerCase(),
  );

  await assertSQL(
    "newGame: global_user_state created",
    db,
    `SELECT * FROM global_user_state WHERE wallet = '${wallet0.address.toLowerCase()}';`,
    (res) => res.rows.length >= 1,
    (res) => res.rows[0].tokens === 0,
  );
}
