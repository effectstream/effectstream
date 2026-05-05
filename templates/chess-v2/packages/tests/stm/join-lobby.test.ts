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

export async function joinLobbyTest(db: Client) {
  const lobbies = await db.query("SELECT lobby_id FROM lobbies WHERE lobby_state = 'open' LIMIT 1");
  if (lobbies.rows.length === 0) {
    console.log("[SKIP] joinLobbyTest: no open lobbies to join");
    return;
  }

  const lobbyId = lobbies.rows[0].lobby_id;
  const account2 = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const walletClient = createWalletClient({
    account: account2,
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

  await assert("Submit joinLobby tx to EffectstreamL2 contract", async () => {
    const input = JSON.stringify(["joinLobby", lobbyId]);
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
    "Lobby becomes active after join",
    db,
    `SELECT * FROM lobbies WHERE lobby_id = '${lobbyId}'`,
    (rows) => rows.length > 0 && (rows[0] as any).lobby_state === "active",
    (rows) => (rows[0] as any).player_two != null,
  );
}
