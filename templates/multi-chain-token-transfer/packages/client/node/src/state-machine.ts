import { PaimaSTM } from "@paimaexample/sm";
import { grammar } from "@multi-chain-transfer/data-types/grammar";
import type { BaseStfInput, BaseStfOutput } from "@paimaexample/sm";
import {
  getEvmMidnightByOwner,
  insertEvmMidnight,
} from "@multi-chain-transfer/database";
import type { StartConfigAppStateTransitions } from "@paimaexample/runtime";
import { type SyncStateUpdateStream, World } from "@paimaexample/coroutine";
import { contractAddressesEvmMain } from "@multi-chain-transfer/evm-contracts";
import { mintInEvm, mintInMidnight } from "@multi-chain-transfer/batcher/calls";

const stm = new PaimaSTM<typeof grammar, any>(grammar);

enum MidnightContractActionName {
  MINT = 1001,
  TRANSFER = 1002,
  BURN_FROM = 1005,
  TRANSFER_FROM = 1006,
  TRANSFER_TO_EVM = 1007,
}

const decodeToByteString = (x: { [key: string]: number }): string => 
  Array(Object.keys(x).length)
    .fill(0)
    .map((_,i)=>x[i])
    .join('')
    .trim();

stm.addStateTransition("midnightContractState", function* (data) {
  const { actionName, actionValue, actionTargetAddress, actionTarget } = data.parsedInput.payload;
  // Example ledger state:
  // {
  //   "txHashes":{},
  //   "lastTransfer":{
  //     "target_address":"0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  //     "amount":"1200"
  //   },
  //   "actionName":"1007",
  //   "actionTarget":{
  //     "is_left":true,
  //      "left":{"bytes":{"0":183,"1":155,"2":5,"3":232,"4":1,"5":188,"6":214,"7":13,"8":144,"9":46,"10":237,"11":119,"12":114,"13":125,"14":118,"15":241,"16":106,"17":227,"18":87,"19":235,"20":235,"21":253,"22":107,"23":228,"24":127,"25":193,"26":73,"27":172,"28":127,"29":148,"30":131,"31":161}},"right":{"bytes":{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0,"12":0,"13":0,"14":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"24":0,"25":0,"26":0,"27":0,"28":0,"29":0,"30":0,"31":0}}
  //   },
  //   "actionTargetAddress":"0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  //   "actionValue":"1200"
  //   }
  switch (Number(actionName)) {
    case MidnightContractActionName.MINT:
      console.log("🎉 [MIDNIGHT] Mint action");
      console.log("🎉 [MIDNIGHT] Mint action Value", actionValue);
      console.log("🎉 [MIDNIGHT] Mint action Target", decodeToByteString(actionTarget.left.bytes));
      break;
    case MidnightContractActionName.TRANSFER_TO_EVM:
      console.log("🎉 [MIDNIGHT] Transfer to EVM action");
      console.log("🎉 [MIDNIGHT] Transfer to EVM action Value", actionValue);
      console.log("🎉 [MIDNIGHT] Transfer to EVM action Target", actionTargetAddress);      
      yield* mintInEvm(actionTargetAddress, BigInt(actionValue));
      break;
    case MidnightContractActionName.BURN_FROM:
      break;
    default: {
      console.error(
        "🎉 [MIDNIGHT] Transaction receipt:",
        JSON.stringify(data.parsedInput.payload)
      );
    }
  }

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
 * @param blockHeight - The block height to process the app state transitions for.
 * @param input - The input to process the app state transitions for.
 * @returns The result of the app state transitions.
 */
export const appStateTransitions: StartConfigAppStateTransitions = function* (
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

