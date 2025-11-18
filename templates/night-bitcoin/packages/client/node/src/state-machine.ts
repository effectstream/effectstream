import { PaimaSTM } from "@paimaexample/sm";
import { grammar } from "@night-bitcoin/data-types/grammar";
import type { BaseStfInput, BaseStfOutput } from "@paimaexample/sm";
import type { StartConfigGameStateTransitions } from "@paimaexample/runtime";
import { type SyncStateUpdateStream, World } from "@paimaexample/coroutine";
import { getIntentByOrderId, getIntentByAddressAndAmount, IGetIntentByOrderIdResult, insertIntent, insertTransfer } from "@night-bitcoin/database";
const stm = new PaimaSTM<typeof grammar, any>(grammar);
import { transferFunds } from "@night-bitcoin/bitcoin-contracts/transfer-funds";
import { transferFunds as transferFundsMidnight } from "@night-bitcoin/midnight-contracts/transfer-funds";

const CHAIN_IDS = {
  BITCOIN: "1",
  MIDNIGHT: "9999",
  EVM: "2",
}
const TOKENS = {
  BTC: "btc",
  M20: "m20",
}

const decodeToByteString = (x: { [key: string]: number }): string =>
  Array(Object.keys(x).length)
    .fill(0)
    .map((_, i) => x[i])
    .join("")
    .trim();


  function decodePaddedString(encodedString: string): string {
    const bytes: number[] = [];
    let i = 0;
  
    while (i < encodedString.length) {
      const char = encodedString[i];
  
      if (char === '0') {
        // Hit the NUL padding (byte 0). We can stop.
        break;
      } else if (char === '1') {
        // 3-digit byte (e.g., 100-127)
        const numStr = encodedString.substring(i, i + 3);
        if (numStr.length < 3) break; // Safety check
        
        bytes.push(parseInt(numStr, 10));
        i += 3;
      } else if (char >= '2' && char <= '9') {
        // 2-digit byte (e.g., 32-99)
        const numStr = encodedString.substring(i, i + 2);
        if (numStr.length < 2) break; // Safety check
  
        bytes.push(parseInt(numStr, 10));
        i += 2;
      } else {
        // Malformed string or unexpected byte
        console.error(`Invalid character at index ${i}: ${char}`);
        break;
      }
    }
  
    // Convert the collected bytes into a Uint8Array
    const uint8Bytes = new Uint8Array(bytes);
  
    // Use TextDecoder to convert the bytes back to a string
    return new TextDecoder().decode(uint8Bytes);
  }

function* checkAndTransferFunds (params: {
  orderId: string | undefined, 
  address: string | undefined,
  amount: string | undefined,
  token: string | undefined,
}) {
  // If it was a payment, let's check if there is intent waiting.
  let intentData: IGetIntentByOrderIdResult | undefined;
  if (params.orderId) {
    const [intent] = yield* World.resolve(getIntentByOrderId, {
      order_id: params.orderId,
    });
 
    if (intent) {
      intentData = intent;
    }
  }

  if (params.address && params.amount && params.token) {
    const [intent] = yield* World.resolve(getIntentByAddressAndAmount, {
      max_spent_recipient: params.address,
      max_spent_amount: params.amount,
      max_spent_token: params.token,
    });

    if (intent) {
      intentData = intent;
    }
  }

  if (!intentData) {
    console.error("No intent found", params);
    return;
  }


  const toChainId = intentData.min_received_chain_id;
  const fromChainId = intentData.max_spent_chain_id;
  
  const fromAddress = intentData.max_spent_recipient;
  const toAddress = intentData.min_received_recipient;

  const fromToken = intentData.max_spent_token;
  const toToken = intentData.min_received_token;
  
  const fromAmount = intentData.max_spent_amount;
  const toAmount = intentData.min_received_amount;

  if (toToken === TOKENS.BTC) {
    const systemWallet = "bc1p...x";
    yield* World.promise(transferFunds(systemWallet, toAddress, toAmount));
  } else if (toToken === TOKENS.M20) {
    const systemWallet = "0x00000000000000000000000000000000000000001";
    yield* World.promise(transferFundsMidnight(systemWallet, toAddress, toAmount));
  } else {
    console.error("No valid transfer found", {
      toChainId,
      fromChainId,
      fromToken,
      toToken,
      fromAddress,
      toAddress,
      fromAmount,
      toAmount,
    });
  }

}

stm.addStateTransition("bitcoinWalletChange", function* (data) {
  console.log(
    "🎉 [BITCOIN] Wallet change:",
    JSON.stringify(data.parsedInput)
  );
  const fromAddress = "bt1p...x";
  const toAddress = "bt1p...x";
  const amount = "12300";

  yield* World.resolve(insertTransfer, {
    from_address: fromAddress,
    to_address: toAddress,
    amount: parseInt(amount, 10),
    token: TOKENS.BTC,
    chain_id: CHAIN_IDS.BITCOIN,
  });

  yield* checkAndTransferFunds({
    orderId: undefined,
    address: fromAddress,
    amount: amount,
    token: TOKENS.BTC,
  });
});

stm.addStateTransition("midnightContractStateERC20", function* (data) {
  console.log(
    "🎉 [MIDNIGHT] Transaction receipt (erc20):",
    JSON.stringify(data.parsedInput.payload)
  );   

  if (data.parsedInput.payload.actionName === "1001") {
      // const sample = {
    //   "txHashes":{},
    //   "lastTransfer":{"target_address":"","amount":"0"},
    //   "actionName":"1001",
    //   "actionTarget":{"is_left":true,
    //     "left":{"bytes":{"0":23,"1":202,"2":238,"3":167,"4":135,"5":235,"6":107,"7":52,"8":239,"9":210,"10":216,"11":238,"12":116,"13":114,"14":201,"15":159,"16":35,"17":250,"18":67,"19":115,"20":168,"21":238,"22":143,"23":152,"24":23,"25":215,"26":72,"27":196,"28":213,"29":53,"30":96,"31":187}},
    //     "right":{"bytes":{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0,"12":0,"13":0,"14":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"24":0,"25":0,"26":0,"27":0,"28":0,"29":0,"30":0,"31":0}}
    //   },
    //   "actionTargetAddress":"",
    //   "actionValue":"100000000000"
    // } 

    const targetWallet = decodeToByteString(data.parsedInput.payload.actionTarget.left.bytes);
    const initiatorWallet = "0";

    // Mint action
    console.log("🎉 [MIDNIGHT] Mint action");
    yield* World.resolve(insertTransfer, {
      from_address: initiatorWallet,
      to_address: targetWallet,
      amount: parseInt(data.parsedInput.payload.actionValue, 10),
      token: TOKENS.M20,
      chain_id: CHAIN_IDS.MIDNIGHT,
    });
  }

  if (data.parsedInput.payload.actionName === "1002") {
      // const sample = {
      //   "txHashes":{},
      //   "lastTransfer":{"target_address":"","amount":"0"},
      //   "actionName":"1002",
      //   "actionTarget":{
      //     "is_left":true,
      //     "left":{"bytes":{"0":220,"1":166,"2":137,"3":110,"4":127,"5":226,"6":240,"7":10,"8":61,"9":99,"10":190,"11":33,"12":104,"13":223,"14":136,"15":98,"16":202,"17":226,"18":74,"19":119,"20":4,"21":113,"22":224,"23":140,"24":100,"25":109,"26":38,"27":13,"28":177,"29":98,"30":103,"31":95}},
      //     "right":{"bytes":{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0,"12":0,"13":0,"14":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"24":0,"25":0,"26":0,"27":0,"28":0,"29":0,"30":0,"31":0}}
      //   },
      //   "actionTargetAddress":"",
      //   "actionValue":"100000000"
      // }
      // Transfer action
      const targetWallet = decodeToByteString(data.parsedInput.payload.actionTarget.left.bytes);
      const initiatorWallet = decodeToByteString(data.parsedInput.payload.actionInitiator.left.bytes);
      const amountTransferred = data.parsedInput.payload.actionValue;
      console.log("🎉 [MIDNIGHT] Transfer action", {
        initiatorWallet,
        targetWallet,
        amountTransferred,
      });

      const systemWallet = "220166137110127226240106199190331042231369820222674119411322414010010938131779810395";

      yield* World.resolve(insertTransfer, {
        from_address: initiatorWallet,
        to_address: targetWallet,
        amount: parseInt(amountTransferred, 10),
        token: TOKENS.M20,
        chain_id: CHAIN_IDS.MIDNIGHT,
      });

      // TODO Check target wallet is validator wallet
      yield* checkAndTransferFunds({
        orderId: undefined,
        address: initiatorWallet,
        amount: amountTransferred,
        token: TOKENS.M20,
      });
  }

});

stm.addStateTransition("midnightContractStateERC7683", function* (data) {
  console.log(
    "🎉 [MIDNIGHT] Transaction receipt (erc7683):",
    JSON.stringify(data.parsedInput.payload)
  );

  let originData = {
    targetWallet: "",
    status: "",
  };

  try {
    originData = JSON.parse(decodePaddedString(decodeToByteString(data.parsedInput.payload.lastIntentEvent.originData)));
    originData.status = "ok";
  } catch (error) {
    console.error("Malformed origin data:", error, data.parsedInput.payload.lastIntentEvent.originData);
    originData.status = "error: " + String(error);
  }

  const parsedPayload = {
    lastIntentType: data.parsedInput.payload.lastIntentType,
    lastIntentEvent: {
      user: decodeToByteString(
        data.parsedInput.payload.lastIntentEvent.user
      ),
      originChainId: data.parsedInput.payload.lastIntentEvent.originChainId,
      openDeadline: data.parsedInput.payload.lastIntentEvent.openDeadline,
      fillDeadline: data.parsedInput.payload.lastIntentEvent.fillDeadline,
      maxSpent_token: decodeToByteString(
        data.parsedInput.payload.lastIntentEvent.maxSpent_token
      ),
      maxSpent_amount: data.parsedInput.payload.lastIntentEvent.maxSpent_amount,
      maxSpent_recipient: decodeToByteString(
        data.parsedInput.payload.lastIntentEvent.maxSpent_recipient
      ),
      maxSpent_chainId:
        data.parsedInput.payload.lastIntentEvent.maxSpent_chainId,
      minReceived_token: decodeToByteString(
        data.parsedInput.payload.lastIntentEvent.minReceived_token
      ),
      minReceived_amount:
        data.parsedInput.payload.lastIntentEvent.minReceived_amount,
      minReceived_recipient: decodeToByteString(
        data.parsedInput.payload.lastIntentEvent.minReceived_recipient
      ),
      minReceived_chainId:
        data.parsedInput.payload.lastIntentEvent.minReceived_chainId,
      destinationChainId:
        data.parsedInput.payload.lastIntentEvent.destinationChainId,
      destinationSettler: decodeToByteString(
        data.parsedInput.payload.lastIntentEvent.destinationSettler
      ),
      originData: JSON.stringify(originData),
      status: data.parsedInput.payload.lastIntentEvent.status,
      orderId: decodeToByteString(data.parsedInput.payload.lastIntentOrderId),
    },
    // lastFillerEvent: data.parsedInput.payload.lastFillerEvent,
  };
  console.log(
    "🎉 [MIDNIGHT] Transaction receipt:",
    JSON.stringify(parsedPayload)
  );
  // 16:58:19 INFO   effectstream-sync: 🎉 [MIDNIGHT] Transaction receipt:
  // const sample = {
  //   lastIntentType: "0",
  //   lastIntentEvent: {
  //     user: "2320223816713523510752239210216238116114201159352506711516823814315223215721962135396187",
  //     originChainId: "0",
  //     openDeadline: "0",
  //     fillDeadline: "0",
  //     maxSpent_token: "00000000000000000000000000000000",
  //     maxSpent_amount: "0",
  //     maxSpent_recipient: "00000000000000000000000000000000",
  //     maxSpent_chainId: "0",
  //     minReceived_token: "00000000000000000000000000000000",
  //     minReceived_amount: "0",
  //     minReceived_recipient: "00000000000000000000000000000000",
  //     minReceived_chainId: "0",
  //     destinationChainId: "0",
  //     destinationSettler: "00000000000000000000000000000000",
  //     originData:
  //       "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  //     status: "0",
  //     orderId: "1311331412546410242185000000000000000000000000",
  //   },
  //   lastFillerEvent: {
  //     is_left: false,
  //     left: {
  //       bytes: {
  //         "0": 0,
  //         "1": 0,
  //         "2": 0,
  //         "3": 0,
  //         "4": 0,
  //         "5": 0,
  //         "6": 0,
  //         "7": 0,
  //         "8": 0,
  //         "9": 0,
  //         "10": 0,
  //         "11": 0,
  //         "12": 0,
  //         "13": 0,
  //         "14": 0,
  //         "15": 0,
  //         "16": 0,
  //         "17": 0,
  //         "18": 0,
  //         "19": 0,
  //         "20": 0,
  //         "21": 0,
  //         "22": 0,
  //         "23": 0,
  //         "24": 0,
  //         "25": 0,
  //         "26": 0,
  //         "27": 0,
  //         "28": 0,
  //         "29": 0,
  //         "30": 0,
  //         "31": 0,
  //       },
  //     },
  //     right: {
  //       bytes: {
  //         "0": 0,
  //         "1": 0,
  //         "2": 0,
  //         "3": 0,
  //         "4": 0,
  //         "5": 0,
  //         "6": 0,
  //         "7": 0,
  //         "8": 0,
  //         "9": 0,
  //         "10": 0,
  //         "11": 0,
  //         "12": 0,
  //         "13": 0,
  //         "14": 0,
  //         "15": 0,
  //         "16": 0,
  //         "17": 0,
  //         "18": 0,
  //         "19": 0,
  //         "20": 0,
  //         "21": 0,
  //         "22": 0,
  //         "23": 0,
  //         "24": 0,
  //         "25": 0,
  //         "26": 0,
  //         "27": 0,
  //         "28": 0,
  //         "29": 0,
  //         "30": 0,
  //         "31": 0,
  //       },
  //     },
  //   },
  // };

  yield* World.resolve(insertIntent, {
    order_id: parsedPayload.lastIntentEvent.orderId as string,
    user_address: parsedPayload.lastIntentEvent.user as string,
    origin_chain_id: parsedPayload.lastIntentEvent.originChainId as string,
    open_deadline: parsedPayload.lastIntentEvent.openDeadline as string,
    fill_deadline: parsedPayload.lastIntentEvent.fillDeadline as string,
    max_spent_token: parsedPayload.lastIntentEvent.maxSpent_token as string,
    max_spent_amount: parsedPayload.lastIntentEvent.maxSpent_amount as string,
    max_spent_recipient: parsedPayload.lastIntentEvent
      .maxSpent_recipient as string,
    max_spent_chain_id: parsedPayload.lastIntentEvent
      .maxSpent_chainId as string,
    min_received_token: parsedPayload.lastIntentEvent
      .minReceived_token as string,
    min_received_amount: parsedPayload.lastIntentEvent
      .minReceived_amount as string,
    min_received_recipient: parsedPayload.lastIntentEvent
      .minReceived_recipient as string,
    min_received_chain_id: parsedPayload.lastIntentEvent
      .minReceived_chainId as string,
    destination_chain_id: parsedPayload.lastIntentEvent
      .destinationChainId as string,
    destination_settler: parsedPayload.lastIntentEvent
      .destinationSettler as string,
    origin_data: parsedPayload.lastIntentEvent.originData,
    status: parsedPayload.lastIntentEvent.status as string,
  });

  yield* checkAndTransferFunds({
    orderId: parsedPayload.lastIntentEvent.orderId,
    address: undefined,
    amount: undefined,
    token: undefined,
  });

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
