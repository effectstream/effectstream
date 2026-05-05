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

export async function submitMoveTest(db: Client) {
  const lobbies = await db.query("SELECT lobby_id, current_round, lobby_creator FROM lobbies WHERE lobby_state = 'active' LIMIT 1");
  if (lobbies.rows.length === 0) {
    console.log("[SKIP] submitMoveTest: no active lobbies");
    return;
  }

  const { lobby_id: lobbyId, current_round: round, lobby_creator: creator } = lobbies.rows[0];

  const account1 = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
  const account2 = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");

  const signerAccount = creator.toLowerCase() === account1.address.toLowerCase() ? account1 : account2;

  const walletClient = createWalletClient({
    account: signerAccount,
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

  await assert("Submit move tx to EffectstreamL2 contract", async () => {
    const input = JSON.stringify(["submitMoves", lobbyId, round, "e4"]);
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
    "Move appears in match_moves table",
    db,
    `SELECT * FROM match_moves WHERE lobby_id = '${lobbyId}' AND round = ${round}`,
    (rows) => rows.length > 0,
    (rows) => (rows[0] as any).move_pgn === "e4",
  );
}
