import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { insertEvent, updateChainStats } from "@evm-cardano/database";
import { grammar } from "./grammar.ts";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const stm = new Stm<typeof grammar, {}>(grammar);

stm.addStateTransition("nft-transfer", function* (data) {
  const { to, from, tokenId, isBurn } = data.parsedInput as {
    to: string;
    from: string;
    tokenId: string;
    isBurn: boolean;
  };

  const eventType =
    from === ZERO_ADDRESS ? "nft_mint" : isBurn ? "nft_burn" : "nft_transfer";

  yield* World.resolve(insertEvent, {
    chain: "evm",
    event_type: eventType,
    from_address: from,
    to_address: to,
    amount: tokenId,
    tx_hash: `evm-block-${data.blockHeight}`,
    block_height: data.blockHeight,
  });

  yield* World.resolve(updateChainStats, {
    chain: "evm",
    block_height: data.blockHeight,
  });
});

stm.addStateTransition("cardano-transfer", function* (data) {
  const { txId, inputCredentials, outputs } = data.parsedInput as {
    txId: string;
    metadata: string;
    inputCredentials: string;
    outputs: string;
  };

  let parsedOutputs: Array<{
    index: number;
    address: string;
    coin: string;
    assets: any[];
  }>;
  try {
    parsedOutputs = JSON.parse(outputs);
  } catch {
    parsedOutputs = [];
  }

  let fromCredential: string | null = null;
  try {
    const creds: string[] = JSON.parse(inputCredentials);
    if (creds.length > 0) fromCredential = creds[0];
  } catch {}

  for (const output of parsedOutputs) {
    yield* World.resolve(insertEvent, {
      chain: "cardano",
      event_type: "ada_transfer",
      from_address: fromCredential,
      to_address: output.address,
      amount: output.coin,
      tx_hash: txId,
      block_height: data.blockHeight,
    });
  }

  if (parsedOutputs.length > 0) {
    yield* World.resolve(updateChainStats, {
      chain: "cardano",
      block_height: data.blockHeight,
    });
  }
});

export const gameStateTransitions: StartConfigGameStateTransitions =
  function* (
    blockHeight: number,
    input: BaseStfInput,
  ): SyncStateUpdateStream<void> {
    yield* stm.processInput(input);
  };
