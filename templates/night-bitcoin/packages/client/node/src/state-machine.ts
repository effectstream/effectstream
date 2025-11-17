import { PaimaSTM } from "@paimaexample/sm";
import { grammar } from "@night-bitcoin/data-types/grammar";
import type { BaseStfInput, BaseStfOutput } from "@paimaexample/sm";
import type { StartConfigGameStateTransitions } from "@paimaexample/runtime";
import { type SyncStateUpdateStream, World } from "@paimaexample/coroutine";
import { insertIntent } from "@night-bitcoin/database";
const stm = new PaimaSTM<typeof grammar, any>(grammar);
import { transferFunds } from "@night-bitcoin/bitcoin-contracts/transfer-funds";
import { transferFunds as transferFundsMidnight } from "@night-bitcoin/midnight-contracts/transfer-funds";

const decodeToByteString = (x: { [key: string]: number }): string =>
  Array(Object.keys(x).length)
    .fill(0)
    .map((_, i) => x[i])
    .join("")
    .trim();


function* checkAndTransferFunds (data: any) {
  // Check if intent is open
  let isIntentOpen = true;
  // Check if deposit is available
  let isDepositAvailable = true;

  let fromAddressBitcoin = "from-address-btc";
  let toAddressBitcoin = "to-address-btc";
  let amountBitcoin = "0.1";
  let fromAddressMidnight = "from-address-midnight";
  let toAddressMidnight = "to-address-midnight";
  let amountMidnight = "0.1";

  if (isIntentOpen && isDepositAvailable) {
    yield* World.promise(transferFunds(fromAddressBitcoin, toAddressBitcoin, amountBitcoin));
    yield* World.promise(transferFundsMidnight(fromAddressMidnight, toAddressMidnight, amountMidnight));
  }
}

stm.addStateTransition("bitcoinWalletChange", function* (data) {
  console.log(
    "🎉 [BITCOIN] Wallet change:",
    JSON.stringify(data.parsedInput.payload)
  );
  yield* checkAndTransferFunds(data);
});

stm.addStateTransition("midnightContractStateERC20", function* (data) {
  console.log(
    "🎉 [MIDNIGHT] Transaction receipt:",
    JSON.stringify(data.parsedInput.payload)
  );
  yield* checkAndTransferFunds(data);
});

stm.addStateTransition("midnightContractStateERC7683", function* (data) {
  console.log(
    "🎉 [MIDNIGHT] Transaction receipt:",
    JSON.stringify(data.parsedInput.payload)
  );
  // data.parsedInput.payload = {
  //   "lastIntentType":"0",
  //   "lastIntentEvent":
  //   {
  //     "user":
  //     {
  //       "is_left":true,
  //       "left":{"bytes":{"0":23,"1":202,"2":238,"3":167,"4":135,"5":235,"6":107,"7":52,"8":239,"9":210,"10":216,"11":238,"12":116,"13":114,"14":201,"15":159,"16":35,"17":250,"18":67,"19":115,"20":168,"21":238,"22":143,"23":152,"24":23,"25":215,"26":72,"27":196,"28":213,"29":53,"30":96,"31":187}},
  //       "right":{"bytes":{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0,"12":0,"13":0,"14":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"24":0,"25":0,"26":0,"27":0,"28":0,"29":0,"30":0,"31":0}}
  //     },
  //     "originChainId":"0",
  //     "openDeadline":"0",
  //     "fillDeadline":"0",
  //     "maxSpent_token":{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0,"12":0,"13":0,"14":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"24":0,"25":0,"26":0,"27":0,"28":0,"29":0,"30":0,"31":0},
  //     "maxSpent_amount":"0",
  //     "maxSpent_recipient":{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0,"12":0,"13":0,"14":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"24":0,"25":0,"26":0,"27":0,"28":0,"29":0,"30":0,"31":0},
  //     "maxSpent_chainId":"0",
  //     "minReceived_token":{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0,"12":0,"13":0,"14":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"24":0,"25":0,"26":0,"27":0,"28":0,"29":0,"30":0,"31":0},
  //     "minReceived_amount":"0",
  //     "minReceived_recipient":{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0,"12":0,"13":0,"14":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"24":0,"25":0,"26":0,"27":0,"28":0,"29":0,"30":0,"31":0},
  //     "minReceived_chainId":"0",
  //     "destinationChainId":"0",
  //     "destinationSettler":{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0,"12":0,"13":0,"14":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"24":0,"25":0,"26":0,"27":0,"28":0,"29":0,"30":0,"31":0},
  //     "originData":{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0,"12":0,"13":0,"14":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"24":0,"25":0,"26":0,"27":0,"28":0,"29":0,"30":0,"31":0,"32":0,"33":0,"34":0,"35":0,"36":0,"37":0,"38":0,"39":0,"40":0,"41":0,"42":0,"43":0,"44":0,"45":0,"46":0,"47":0,"48":0,"49":0,"50":0,"51":0,"52":0,"53":0,"54":0,"55":0,"56":0,"57":0,"58":0,"59":0,"60":0,"61":0,"62":0,"63":0,"64":0,"65":0,"66":0,"67":0,"68":0,"69":0,"70":0,"71":0,"72":0,"73":0,"74":0,"75":0,"76":0,"77":0,"78":0,"79":0,"80":0,"81":0,"82":0,"83":0,"84":0,"85":0,"86":0,"87":0,"88":0,"89":0,"90":0,"91":0,"92":0,"93":0,"94":0,"95":0,"96":0,"97":0,"98":0,"99":0,"100":0,"101":0,"102":0,"103":0,"104":0,"105":0,"106":0,"107":0,"108":0,"109":0,"110":0,"111":0,"112":0,"113":0,"114":0,"115":0,"116":0,"117":0,"118":0,"119":0,"120":0,"121":0,"122":0,"123":0,"124":0,"125":0,"126":0,"127":0,"128":0,"129":0,"130":0,"131":0,"132":0,"133":0,"134":0,"135":0,"136":0,"137":0,"138":0,"139":0,"140":0,"141":0,"142":0,"143":0,"144":0,"145":0,"146":0,"147":0,"148":0,"149":0,"150":0,"151":0,"152":0,"153":0,"154":0,"155":0,"156":0,"157":0,"158":0,"159":0,"160":0,"161":0,"162":0,"163":0,"164":0,"165":0,"166":0,"167":0,"168":0,"169":0,"170":0,"171":0,"172":0,"173":0,"174":0,"175":0,"176":0,"177":0,"178":0,"179":0,"180":0,"181":0,"182":0,"183":0,"184":0,"185":0,"186":0,"187":0,"188":0,"189":0,"190":0,"191":0,"192":0,"193":0,"194":0,"195":0,"196":0,"197":0,"198":0,"199":0,"200":0,"201":0,"202":0,"203":0,"204":0,"205":0,"206":0,"207":0,"208":0,"209":0,"210":0,"211":0,"212":0,"213":0,"214":0,"215":0,"216":0,"217":0,"218":0,"219":0,"220":0,"221":0,"222":0,"223":0,"224":0,"225":0,"226":0,"227":0,"228":0,"229":0,"230":0,"231":0,"232":0,"233":0,"234":0,"235":0,"236":0,"237":0,"238":0,"239":0,"240":0,"241":0,"242":0,"243":0,"244":0,"245":0,"246":0,"247":0,"248":0,"249":0,"250":0,"251":0,"252":0,"253":0,"254":0,"255":0},
  //     "status":"0"
  //   },
  //   "lastFillerEvent":{
  //     "is_left":false,
  //     "left":{"bytes":{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0,"12":0,"13":0,"14":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"24":0,"25":0,"26":0,"27":0,"28":0,"29":0,"30":0,"31":0}},
  //     "right":{"bytes":{"0":0,"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0,"11":0,"12":0,"13":0,"14":0,"15":0,"16":0,"17":0,"18":0,"19":0,"20":0,"21":0,"22":0,"23":0,"24":0,"25":0,"26":0,"27":0,"28":0,"29":0,"30":0,"31":0}}
  //   },
  //   "intents":{},
  //   "fillers":{}
  // };
  const parsedPayload = {
    lastIntentType: data.parsedInput.payload.lastIntentType,
    lastIntentEvent: {
      user: decodeToByteString(
        data.parsedInput.payload.lastIntentEvent.user.left.bytes
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
      originData: decodeToByteString(
        data.parsedInput.payload.lastIntentEvent.originData
      ),
      status: data.parsedInput.payload.lastIntentEvent.status,
      orderId: decodeToByteString(data.parsedInput.payload.lastIntentOrderId),
    },
    lastFillerEvent: data.parsedInput.payload.lastFillerEvent,
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
    origin_data: parsedPayload.lastIntentEvent.originData as string,
    status: parsedPayload.lastIntentEvent.status as string,
  });

  yield* checkAndTransferFunds(data);
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
