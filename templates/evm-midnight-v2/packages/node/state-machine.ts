import { Stm } from "@effectstream/sm";
import { grammar } from "./grammar.ts";
import type { BaseStfInput } from "@effectstream/sm";
import {
  getEvmMidnightByTokenId,
  insertEvmMidnight,
  insertEvmMidnightProperty,
} from "@evm-midnight/database";
import type { StartConfigAppStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { contractAddressesEvmMain } from "@evm-midnight/contracts-evm";

const stm = new Stm<typeof grammar, {}>(grammar);

const decodeField = (x: string | { [key: string]: number }): string => {
  if (typeof x === 'string') {
    // Hex-encoded string: each pair of hex chars is one ASCII byte
    return x.replace(/../g, m => String.fromCharCode(parseInt(m, 16)))
      .replace(/\0/g, '')
      .trim();
  }
  // Legacy byte-index object
  return Array(Object.keys(x).length)
    .fill(0)
    .map((_, i) => x[i])
    .map(c => String.fromCharCode(c))
    .join('')
    .replace(/\0/g, '')
    .trim();
};

stm.addStateTransition(
  "midnightContractState",
  function* (data) {
    console.log("[STM:midnight] raw parsedInput:", JSON.stringify(data.parsedInput, null, 2));

    const payload: {
      round: string;
      contract_address: string | { [key: string]: number };
      token_id: string | { [key: string]: number };
      property_name: string | { [key: string]: number };
      value: string | { [key: string]: number };
    } = data.parsedInput.payload;

    console.log("[STM:midnight] payload keys:", Object.keys(payload));
    console.log("[STM:midnight] payload:", JSON.stringify(payload, null, 2));

    const contract_address = decodeField(payload.contract_address);
    const token_id = decodeField(payload.token_id);
    const property_name = decodeField(payload.property_name);
    const value = decodeField(payload.value);

    console.log("[STM:midnight] decoded:", { contract_address, token_id, property_name, value });

    if (!token_id) {
      console.log("[STM:midnight] empty token_id, skipping");
      return;
    }

    try {
      const [evmMidnight] = yield* World.resolve(getEvmMidnightByTokenId, {
        contract_address,
        token_id,
      });

      if (!evmMidnight) {
        yield* World.resolve(insertEvmMidnight, {
          contract_address,
          token_id,
          owner: "",
          block_height: data.blockHeight,
        });
      }

      yield* World.resolve(insertEvmMidnightProperty, {
        contract_address,
        token_id,
        property_name,
        value,
        block_height: data.blockHeight,
      });
    } catch (error) {
      console.error("[TRANSFER-ASSETS] Database not ready.", error);
      return;
    }
  },
);

stm.addStateTransition(
  "transfer-assets",
  function* (data) {
    const { to, tokenId }: any = data.parsedInput;
    const contract_address =
      contractAddressesEvmMain().chain31337["Erc721DevModule#Erc721Dev"];
    yield* World.resolve(insertEvmMidnight, {
      contract_address,
      token_id: tokenId,
      owner: to,
      block_height: data.blockHeight,
    });
  },
);

export const appStateTransitions: StartConfigAppStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
