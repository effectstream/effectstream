import { PaimaSTM } from "@paimaexample/sm";
import { grammar } from "@night-bitcoin/data-types/grammar";
import type { BaseStfInput, BaseStfOutput } from "@paimaexample/sm";
import type { StartConfigGameStateTransitions } from "@paimaexample/runtime";
import { type SyncStateUpdateStream, World } from "@paimaexample/coroutine";
import { 
  getIntentByOrderId, 
  IGetIntentByOrderIdResult, 
  insertIntent, 
  insertTransfer, 
  getTransferToMatchIntent, 
  IGetTransferToMatchIntentResult,
  getIntentToMatchTransfer,
  getTransferById,
  getSomeUnusedTransfer,
  updateTransferUsed,
  updateIntentResolved,
  getBestQuoteForOrder,
} from "@night-bitcoin/database";
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

type CheckParamsType = {
  type: "intent-received";
  orderId: string;
} | {
  type: "transfer-received";
  id: number;
  amount: string;
  token: string;
}

// Helper to map filler names to ports
function getFillerPort(name: string): number {
  const fillers = [
    { name: "Alpha Liquidity", port: 16101 },
    { name: "Omega Swap", port: 16102 },
    { name: "Quantum Pools", port: 16103 },
    { name: "Zenith Trade", port: 16104 },
    { name: "Orion Exchange", port: 16105 },
    { name: "Nexus Liquidity", port: 16106 },
    { name: "Phoenix Finance", port: 16107 },
    { name: "Galaxy Swaps", port: 16108 },
    { name: "Infinity Pools", port: 16109 },
    { name: "Polaris Trade", port: 16110 },
  ];
  const filler = fillers.find(f => f.name === name);
  // Default to first one if not found (fallback)
  return filler ? filler.port : 16101;
}

function* checkAndTransferFunds (params: CheckParamsType) {
  // If it was a payment, let's check if there is intent waiting.
  let intentData: IGetIntentByOrderIdResult | undefined;
  let paymentData: IGetTransferToMatchIntentResult | undefined;
  
  if (params.type === "intent-received") {
    const [intent] = yield* World.resolve(getIntentByOrderId, {
      order_id: params.orderId,
    });
 
    if (intent) {
      intentData = intent;
    } else {
      console.error("Critical error: No intent found", params);
      return;
    }

    const SYSTEM_WALLET_MIDNIGHT = "220166137110127226240106199190331042231369820222674119411322414010010938131779810395";
    const SYSTEM_WALLET_BTC = "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03";
    
    const [payment] = yield* World.resolve(getTransferToMatchIntent, {
      to_address: intent.max_spent_token === TOKENS.M20 ? SYSTEM_WALLET_MIDNIGHT : SYSTEM_WALLET_BTC,
      amount: intent.max_spent_amount,
      token: intent.max_spent_token,
      chain_id: intent.max_spent_chain_id,
    });

    if (payment) {
      paymentData = payment;
    } else {
      console.error("No payment found", params);
      return;
    }
  } else if (params.type === "transfer-received") {

    const [payment] = yield* World.resolve(getTransferById, {
      id: params.id,
    });
    if (payment) {
      paymentData = payment;
    } else {
      console.error("Critical error: No payment found", params);
      return;
    }

    // TODO This is missing the chain id check.
    const [intent] = yield* World.resolve(getIntentToMatchTransfer, {
      max_spent_amount: params.amount,
      max_spent_token: params.token,
    });

    if (intent) {
      intentData = intent;
    } else {
      console.error("No intent found", params);
      return;
    }
  }
  
  // These are just guards, we know they are defined.
  if (!intentData) {return;}
  if (!paymentData) {return;}


  const toChainId = intentData.min_received_chain_id;
  const fromChainId = intentData.max_spent_chain_id;
  
  const fromAddress = intentData.max_spent_recipient;
  const toAddress = intentData.min_received_recipient;

  const fromToken = intentData.max_spent_token;
  const toToken = intentData.min_received_token;
  
  const fromAmount = intentData.max_spent_amount;
  const toAmount = intentData.min_received_amount;

  // TODO This should be done by the fillers.
  const [quote] = yield* World.resolve(getBestQuoteForOrder, {
    order_id: intentData.order_id,
  });
  if (!quote) {
    console.error("Critical error: No quote found", intentData);
    return;
  }

  yield* World.resolve(updateTransferUsed, {
    id: paymentData.id,
  });

  yield* World.resolve(updateIntentResolved, {
    order_id: intentData.order_id,
    resolved_by: quote.filler,
  });

  // Run outside the State machine.
  setTimeout(async () => {
    // NOTIFY FILLER to Pay the user
    const fillerPort = getFillerPort(quote.filler);
    const fillerEndpoint = `http://localhost:${fillerPort}/api/notify-filler-intent-payment`;

    console.log(`📣 Notifying filler ${quote.filler} (port ${fillerPort}) to pay user`, {
        toAddress,
        toAmount,
        toToken
    });

    try {
      const response = await fetch(fillerEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            orderId: intentData!.order_id,
            toAddress: toAddress,
            amount: parseFloat(toAmount), // Converting string to number as expected by schema
            token: toToken,
            chainId: toChainId
        })
      });
      const data = await response.json();
      console.log("Filler notified:", data);
    } catch (err) {
      console.error("Failed to notify filler:", err);
    }

  },0);

  // Run outside the State machine.
  setTimeout(() => {
    try {
      // Pay the filler
      // NOTE: This logic remains here as Paima Engine "System" paying the filler back.
      // For now we keep the simulation of "paying the filler back" using the system wallet.
      if (fromToken === TOKENS.BTC) {
        const fillerWallet = "bcrt1qpj3uq5pf7mpe8hs5f8wcm7xf8jt57fxrkhays7";
        transferFunds("filler-wallet-btc", fillerWallet, fromAmount);
      } else if (fromToken === TOKENS.M20) {
        const fillerWaller = "mn_shield-addr_undeployed1k7dst6qphntqmypwa4mhyltk794wx4lt07kherlc9y6clu5swssxqr9xe4z7txy8rscldhec7nmm47ujccf7syky0wz86jwahhkfd3mvq9wu8qx";
        transferFundsMidnight("filler-midnight-walllet", fillerWaller, fromAmount);
      } else {
        console.error("No valid transfer found (0x02)", {
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
    } catch (error) {
      console.error("Processing error", error);
    }
  }, 0);
  

}

stm.addStateTransition("bitcoin-transaction", function* (data) {
  console.log(
    "🎉 [BITCOIN] Wallet change:",
    JSON.stringify(data.parsedInput)
  );

//  const sample = {
//   "direction":"output",
//   "address":"bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03",
//   "transactionId":"c5a027e67698a2003084288695b015ad240fe1b4224d3d9b2c183f6ce9d275cd",
//   "index":1,
//   "valueSats":10000000,
//   "utxoTxid":"c5a027e67698a2003084288695b015ad240fe1b4224d3d9b2c183f6ce9d275cd",
//   "utxoVout":1,
//   "label":""
//   }

  const fromAddress: string | undefined = undefined;
  const toAddress: string = data.parsedInput.address;
  const amount: number = data.parsedInput.valueSats;

  yield* World.resolve(insertTransfer, {
    from_address: "",
    to_address: toAddress,
    amount,
    token: TOKENS.BTC,
    chain_id: CHAIN_IDS.BITCOIN,
  });

  const [payment] = yield* World.resolve(getSomeUnusedTransfer, {
    from_address: "",
    to_address: toAddress,
    amount: String(amount),
    token: TOKENS.BTC,
    chain_id: CHAIN_IDS.BITCOIN,
  });

  const SYSTEM_WALLET_MIDNIGHT = "220166137110127226240106199190331042231369820222674119411322414010010938131779810395";
  const SYSTEM_WALLET_BTC = "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03";

  if (toAddress === SYSTEM_WALLET_BTC) {
    yield* checkAndTransferFunds({
      type: "transfer-received",
      id: payment.id,
      amount: String(amount),
      token: TOKENS.BTC,
    });
  } else {
    console.error("Transfer is not for system wallet", { toAddress, token:TOKENS.BTC, amount: String(amount) });
  }
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
      const amountTransferred: string = data.parsedInput.payload.actionValue;
      console.log("🎉 [MIDNIGHT] Transfer action", {
        initiatorWallet,
        targetWallet,
        amountTransferred,
      });

      const SYSTEM_WALLET_MIDNIGHT = "220166137110127226240106199190331042231369820222674119411322414010010938131779810395";
      const SYSTEM_WALLET_BTC = "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03";

      yield* World.resolve(insertTransfer, {
        from_address: initiatorWallet,
        to_address: targetWallet,
        amount: parseInt(amountTransferred, 10),
        token: TOKENS.M20,
        chain_id: CHAIN_IDS.MIDNIGHT,
      });

      const [payment] = yield* World.resolve(getSomeUnusedTransfer, {
        from_address: initiatorWallet,
        to_address: targetWallet,
        amount: amountTransferred,
        token: TOKENS.M20,
        chain_id: CHAIN_IDS.MIDNIGHT,
      });

      if (targetWallet === SYSTEM_WALLET_MIDNIGHT) {
        // TODO Check target wallet is validator wallet
        yield* checkAndTransferFunds({
          type: "transfer-received",
          id: payment.id,
          amount: amountTransferred,
          token: TOKENS.M20,
        });
      } else {
        console.error("Transfer is not for system wallet", { targetWallet, token:TOKENS.M20, amount: String(amountTransferred) });
      }
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
    return;
  }

  const parsedPayload = {
    lastIntentType: data.parsedInput.payload.lastIntentType,
    lastIntentEvent: {
      user: decodeToByteString(data.parsedInput.payload.lastIntentEvent.user),
      orderId: decodePaddedString(decodeToByteString(data.parsedInput.payload.lastIntentOrderId)),

      originChainId: data.parsedInput.payload.lastIntentEvent.originChainId,
      destinationChainId: data.parsedInput.payload.lastIntentEvent.destinationChainId,

      openDeadline: data.parsedInput.payload.lastIntentEvent.openDeadline,
      fillDeadline: data.parsedInput.payload.lastIntentEvent.fillDeadline,

      maxSpent_token: decodePaddedString(decodeToByteString(data.parsedInput.payload.lastIntentEvent.maxSpent_token)),
      maxSpent_amount: data.parsedInput.payload.lastIntentEvent.maxSpent_amount,
      maxSpent_recipient: decodePaddedString(decodeToByteString(data.parsedInput.payload.lastIntentEvent.maxSpent_recipient)),
      maxSpent_chainId:data.parsedInput.payload.lastIntentEvent.maxSpent_chainId,

      minReceived_token: decodePaddedString(decodeToByteString(data.parsedInput.payload.lastIntentEvent.minReceived_token)),
      minReceived_amount:data.parsedInput.payload.lastIntentEvent.minReceived_amount,
      minReceived_recipient: decodePaddedString(decodeToByteString(data.parsedInput.payload.lastIntentEvent.minReceived_recipient)),
      minReceived_chainId:data.parsedInput.payload.lastIntentEvent.minReceived_chainId,
      
      destinationSettler: decodeToByteString(data.parsedInput.payload.lastIntentEvent.destinationSettler),
      originData: JSON.stringify(originData),
      status: data.parsedInput.payload.lastIntentEvent.status,
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
  //       "000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
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
    type: "intent-received",
    orderId: parsedPayload.lastIntentEvent.orderId as string,
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
