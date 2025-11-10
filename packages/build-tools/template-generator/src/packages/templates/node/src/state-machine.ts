import { PaimaSTM } from "@paimaexample/sm";
import { grammar } from "@multi-chain-transfer/data-types/grammar";
import type { BaseStfInput, BaseStfOutput } from "@paimaexample/sm";
import {
  getEvmMidnightByOwner,
  insertEvmMidnight,
} from "@multi-chain-transfer/database";
import type { StartConfigGameStateTransitions } from "@paimaexample/runtime";
import { type SyncStateUpdateStream, World } from "@paimaexample/coroutine";
import { contractAddressesEvmMain } from "@[scope]/evm-contracts";
import { mintInEvm, mintInMidnight } from "@[scope]/batcher/calls";

const stm = new PaimaSTM<typeof grammar, any>(grammar);


const decodeToByteString = (x: { [key: string]: number }): string => 
  Array(Object.keys(x).length)
    .fill(0)
    .map((_,i)=>x[i])
    .join('')
    .trim();

stm.addStateTransition("midnightContractState", function* (data) {
    console.log
      "🎉 [MIDNIGHT] Transaction receipt:",
      JSON.stringify(data.parsedInput.payload)
    );  
});

stm.addStateTransition("transfer-to-midnight", function* (data) {
  // For now token id is hardcoded to 0 in the midnight contract.
  const { midnight_address, amount } = data.parsedInput;
  const contract_address =
    contractAddressesEvmMain().chain31337["Erc1155DevModule#MCT_ERC1155"];
  console.log("🎉 [TRANSFER-TO-MIDNIGHT] Transaction receipt:");
  console.log(JSON.stringify(data.parsedInput));
  console.log("@ Contract address:", contract_address);
  yield* mintInMidnight(midnight_address, BigInt(amount));
});

stm.addStateTransition("evm-transfer-erc1155", function* (data) {
  console.log("🎉 [TRANSFER-ASSETS] Transaction receipt:");
  const { to, tokenId, isMint, amount, isBurn, from } = data.parsedInput;
  const contract_address =
    contractAddressesEvmMain().chain31337["Erc1155DevModule#MCT_ERC1155"];
  console.log("🎉 [TRANSFER-ASSETS]", {
    to,
    tokenId,
    isMint,
    amount,
    isBurn,
    from,
  });

  const getBalance = function* (address: string) {
    const [evmMidnightBalances] = yield* World.resolve(getEvmMidnightByOwner, {
      contract_address,
      owner: address,
    });
    if (!evmMidnightBalances) return BigInt(0);
    return BigInt(evmMidnightBalances.amount);
  };

  const toBalance = yield* getBalance(to);
  const fromBalance = yield* getBalance(from);

  const isTransfer = !isMint && !isBurn;

  const updateFrom = isTransfer || isBurn;
  const updateTo = isTransfer || isMint || isBurn;

  // Update balances
  if (updateFrom) {
    yield* World.resolve(insertEvmMidnight, {
      contract_address,
      chain: "EVM",
      token_id: tokenId,
      amount: (fromBalance - BigInt(amount)).toString(),
      owner: from,
      block_height: data.blockHeight,
    });
  }
  if (updateTo) {
    yield* World.resolve(insertEvmMidnight, {
      contract_address,
      chain: "EVM",
      token_id: tokenId,
      amount: (toBalance + BigInt(amount)).toString(),
      owner: to,
      block_height: data.blockHeight,
    });
  }
});

// stm.finalize(); // this avoids people dynamically calling stm.addStateTransition after initialization

/**
 * This function allows you to route between different State Transition Functions
 * based on block height. In other words when a new update is pushed for your game
 * that includes new logic, this router allows your game node to cleanly maintain
 * backwards compatibility with the old history before the new update came into effect.
 * @param blockHeight - The block height to process the game state transitions for.
 * @param input - The input to process the game state transitions for.
 * @returns The result of the game state transitions.
 */
export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput
): SyncStateUpdateStream<void> {
  if (blockHeight >= 0) {
    yield* stm.processInput(input);
  } else {
    yield* stm.processInput(input);
  }
  return;
};

