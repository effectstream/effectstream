import {
  type INewScheduledHeightDataParams,
  newScheduledHeightData,
} from "@paimaexample/db";
import { AddressType } from "@paimaexample/utils";

type SQLUpdate = [any, any];
// Schedule a practice move update to be executed in the future
export function schedulePracticeMove(
  lobbyId: string,
  round: number,
  block_height: number,
): SQLUpdate {
  const params: INewScheduledHeightDataParams = {
    from_address: "0x0", // TODO This should be a Paima Engine Constant
    from_address_type: AddressType.NONE,
    future_block_height: block_height,
    input_data: createPracticeInput(lobbyId, round),
  };
  return [newScheduledHeightData, params];
}

function createPracticeInput(lobbyId: string, round: number) {
  // TODO: we don't support the "*" serial indicator for keys.
  //       it should be `*${lobbyId}`
  return JSON.stringify(["sb", `${lobbyId}`, `${round}`]);
}
