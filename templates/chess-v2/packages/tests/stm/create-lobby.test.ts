import type { Client } from "pg";
import { assert, assertSQL } from "../helpers.ts";
import { createPublicClient, createWalletClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const effectstreamL2Abi = [{
  inputs: [{ name: "data", type: "bytes" }],
  name: "effectstreamSubmitGameInput",
  outputs: [],
  stateMutability: "payable",
  type: "function",
}] as const;

export async function createLobbyTest(db: Client) {
  const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const walletClient = createWalletClient({
    account,
    chain: foundry,
    transport: http("http://localhost:8545"),
  });
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http("http://localhost:8545"),
  });

  const mod = await import("@chess-v2/contracts-evm");
  const addresses = (mod as any).contractAddressesEvmMain();
  const l2Address = addresses.chain31337["EffectstreamL2Module#MyEffectstreamL2"] as `0x${string}`;

  await assert("Submit createLobby tx to EffectstreamL2 contract", async () => {
    const input = JSON.stringify(["createdLobby", 3, 50, 50, false, true, 0, true]);
    const hash = await walletClient.writeContract({
      address: l2Address,
      abi: effectstreamL2Abi,
      functionName: "effectstreamSubmitGameInput",
      args: [toHex(input)],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.status === "success";
  });

  await assertSQL(
    "Lobby appears in DB after creation",
    db,
    "SELECT * FROM lobbies LIMIT 1",
    (rows) => rows.length > 0,
    (rows) => (rows[0] as any).num_of_rounds === 3 && (rows[0] as any).practice === true,
  );
}
