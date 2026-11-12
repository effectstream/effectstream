import { Stm } from "@effectstream/sm";
import { grammar } from "./grammar.ts";
import type { BaseStfInput } from "@effectstream/sm";
import {
  insertNftLock,
} from "@projected-nft-preorder/database";
import type { StartConfigAppStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";

const stm = new Stm<typeof grammar, {}>(grammar);

stm.addStateTransition(
  "cardano-projected-nft",
  function* (data) {
    const {
      ownerAddress,
      previousTxId,
      previousOutputIndex,
      currentTxId,
      currentOutputIndex,
      policyId,
      assetName,
      status,
      forHowLong,
    } = data.parsedInput as {
      ownerAddress: string;
      previousTxId: string;
      previousOutputIndex: string;
      currentTxId: string;
      currentOutputIndex: string;
      policyId: string;
      assetName: string;
      status: string;
      forHowLong: string;
    };

    if (!ownerAddress || !currentTxId || !policyId) return;

    yield* World.resolve(insertNftLock, {
      owner_address: ownerAddress,
      policy_id: policyId,
      asset_name: assetName,
      status,
      current_tx_id: currentTxId,
      previous_tx_id: previousTxId || null,
      current_output_index: currentOutputIndex || null,
      previous_output_index: previousOutputIndex || null,
      for_how_long: forHowLong || null,
      block_height: data.blockHeight,
    });

    console.log(`[STM:projected-nft] ${status}: policy=${policyId.slice(0, 16)}... owner=${ownerAddress.slice(0, 16)}...`);
  },
);

export const appStateTransitions: StartConfigAppStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
