// import { retryPromise } from '@paimaexample/sdk/utils';
// import { builder } from '@paimaexample/sdk/concise';
// import type { EndpointErrorFxn, FailedResult, OldResult, Result } from '@paimaexample/sdk/mw-core';
// import {
//   awaitBlock,
//   getDefaultActiveAddress,
//   PaimaMiddlewareErrorCode,
//   postConciseData,
// } from '@paimaexample/sdk/mw-core';

// import { buildEndpointErrorFxn, MiddlewareErrorCode } from '../errors.ts';
import { getLobbyStateWithUser, getNonemptyNewLobbies } from '../helpers/auxiliary-queries.ts';
import { lobbyWasClosed, userCreatedLobby, userJoinedLobby } from '../helpers/utility-functions.ts';
import type { MatchMove } from '@chess/game-logic';
import type { CreateLobbySuccessfulResponse, PackedLobbyState } from '../types.ts';
import { FailedResult, OldResult } from "../helpers/utility-functions.ts";

const RETRY_PERIOD = 1000;
const RETRIES_COUNT = 8;

// const getUserWallet = (errorFxn: EndpointErrorFxn): Result<string> => {
//   try {
//     const wallet = getDefaultActiveAddress();
//     if (wallet.length === 0) {
//       return errorFxn(PaimaMiddlewareErrorCode.WALLET_NOT_CONNECTED);
//     }
//     return { result: wallet, success: true };
//   } catch (err) {
//     return errorFxn(PaimaMiddlewareErrorCode.INTERNAL_INVALID_POSTING_MODE, err);
//   }
// };

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";
// import { createMessageForBatcher } from "@paimaexample/concise";
import { sendBatcherTransaction, type Wallet } from "@paimaexample/wallets";
/** This is what wallets sign when submitting a batch */
// export function createMessageForBatcher(
//   namespace: string | null,
//   millisecondTimestamp: string,
//   walletAddress: string,
//   inputData: string,
// ): string {
//   return ((namespace ?? "") + millisecondTimestamp + walletAddress + inputData)
//     .replace(/[^a-zA-Z0-9]/g, "-")
//     .toLocaleLowerCase();
// }


// const AddressType = {
//   EVM: 0,
// };

// interface Notification {
//   id: number;
//   type: "success" | "error" | "info";
//   title: string;
//   message: string;
// }

// interface WalletInfo {
//   privateKey: `0x${string}`;
//   address: `0x${string}`;
// }

// async function createSignedInput(gameInput: string, walletInfo: WalletInfo) {
//   const account = privateKeyToAccount(walletInfo.privateKey);
//   const walletClient = createWalletClient({
//     account,
//     chain: hardhat,
//     transport: http(),
//   });

//   const timestamp = Date.now().toString();
//   const userAddress = account.address;
//   const addressType = AddressType.EVM;

//   // TODO This should be provided by @paima/* package.
//   const message = sendBatcherTransaction(
//     null,
//     timestamp,
//     userAddress,
//     gameInput,
//   );

//   const signature = await walletClient.signMessage({
//     message,
//   });

//   return {
//     addressType,
//     userAddress,
//     userSignature: signature,
//     gameInput,
//     millisecondTimestamp: timestamp,
//   };
// }

// const ENV = {
//   PAIMA_API_PORT: 9999,
//   BATCHER_PORT: 3334,
//   DOCS_PORT: 9999,
// };

// export const CONFIG_ENDPOINT = `http://127.0.0.1:${ENV.PAIMA_API_PORT}/config`;
// export const PRIMITIVES_ENDPOINT =
//   `http://127.0.0.1:${ENV.PAIMA_API_PORT}/primitives`;
// export const TABLES_ENDPOINT = `http://127.0.0.1:${ENV.PAIMA_API_PORT}/tables`;
// export const GRAMMAR_ENDPOINT =
//   `http://127.0.0.1:${ENV.PAIMA_API_PORT}/grammar`;
// export const SCHEDULED_DATA_ENDPOINT =
//   `http://127.0.0.1:${ENV.PAIMA_API_PORT}/scheduled-data`;
// export const PRIMITIVES_SCHEMA_ENDPOINT =
//   `http://127.0.0.1:${ENV.PAIMA_API_PORT}/primitives-schema`;
// export const TABLE_SCHEMA_ENDPOINT =
//   `http://127.0.0.1:${ENV.PAIMA_API_PORT}/table-schema`;
// export const BATCHER_ENDPOINT =
//   `http://localhost:${ENV.BATCHER_PORT}/send-input`;
// export const BATCHER_OPENAPI_URL =
//   `http://localhost:${ENV.BATCHER_PORT}/documentation`;
// export const ENGINE_OPENAPI_URL =
//   `http://localhost:${ENV.PAIMA_API_PORT}/documentation`;
// export const DOCUMENTATION_URL = `http://127.0.0.1:${ENV.DOCS_PORT}/`;
// export const ADDRESSES_ENDPOINT =
//   `http://127.0.0.1:${ENV.PAIMA_API_PORT}/addresses`;


// // TODO This should be provided by @paima/* package.
// async function sendInputToBatcher(batchedInput: any) {
//   const response = await fetch(BATCHER_ENDPOINT, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify(batchedInput),
//   });

//   if (!response.ok) {
//     throw new Error(`HTTP error! status: ${response.status}`);
//   }

//   return await response.json();
// }

// // TODO This should be provided by @paima/* package.
// async function postToBatcher(jsonArrayString: string, walletInfo: WalletInfo) {
//   console.log("🚀 Creating signed input for:", jsonArrayString);
//   const signedInput = await createSignedInput(jsonArrayString, walletInfo);

//   console.log("✅ Signed input created:", {
//     ...signedInput,
//     userSignature: signedInput.userSignature.slice(0, 10) + "...",
//   });

//   console.log("📤 Sending to batcher...");
//   const result = await sendInputToBatcher(signedInput);

//   console.log("🎉 Batcher response:", result);
//   return result;
// }

async function createLobby(
  wallet: Wallet,
  userAddress: string,
  numberOfRounds: number,
  roundLength: number,
  playTimePerPlayer: number,
  botDifficulty: number,
  isHidden = false,
  isPractice = false,
  playerOneIsWhite = true
): Promise<CreateLobbySuccessfulResponse | FailedResult> {
  // const errorFxn = buildEndpointErrorFxn('createLobby');


  const conciseData = [
    "createdLobby",
    numberOfRounds,
    roundLength,
    playTimePerPlayer,
    isHidden,
    isPractice,
    botDifficulty,
    playerOneIsWhite,
  ];
  sendBatcherTransaction(wallet, conciseData);
  
  // getLobbyStateWithUser(userAddress, 1);
  // return { success: true, lobbyID: "1", lobbyStatus: 'open' };
  // while (true) {

    // Wait until ready??

  // }
  // const query = getUserWallet(errorFxn);
  // if (!query.success) return query;
  // const userWalletAddress = query.result;

  // const conciseBuilder = builder.initialize(undefined);
  // conciseBuilder.setPrefix('c');
  // conciseBuilder.addValues([
  //   { value: numberOfRounds.toString(10) },
  //   { value: roundLength.toString(10) },
  //   { value: playTimePerPlayer.toString(10) },
  //   { value: isHidden ? 'T' : 'F' },
  //   { value: isPractice ? 'T' : 'F' },
  //   { value: botDifficulty.toString(10) },
  //   { value: playerOneIsWhite ? 'T' : 'F' },
  // ]);

  // const response = await postConciseData(conciseBuilder.build(), errorFxn);
  // if (!response.success) return response;
  // console.log(response);

  // const currentBlock = response.blockHeight;
  // try {
  //   await awaitBlock(currentBlock);
  //   const newLobbies = await retryPromise(
  //     () => getNonemptyNewLobbies(userWalletAddress, currentBlock),
  //     RETRY_PERIOD,
  //     RETRIES_COUNT
  //   );
  //   if (
  //     !newLobbies.hasOwnProperty('lobbies') ||
  //     !Array.isArray(newLobbies.lobbies) ||
  //     newLobbies.lobbies.length === 0
  //   ) {
  //     return errorFxn(MiddlewareErrorCode.FAILURE_VERIFYING_LOBBY_CREATION);
  //   }
    return {
      success: true,
      lobbyID: "1", // newLobbies.lobbies[0].lobby_id,
      lobbyStatus: 'open',
    };
  // } catch (err) {
  //   return errorFxn(MiddlewareErrorCode.FAILURE_VERIFYING_LOBBY_CREATION, err);
  // }
}

async function joinLobby(lobbyID: string): Promise<OldResult> {
  // const errorFxn = buildEndpointErrorFxn('joinLobby');

  // const query = getUserWallet(errorFxn);
  // if (!query.success) return query;
  // const userWalletAddress = query.result;

  // const conciseBuilder = builder.initialize(undefined);
  // conciseBuilder.setPrefix('j');
  // conciseBuilder.addValue({ value: lobbyID, isStateIdentifier: true });

  // const response = await postConciseData(conciseBuilder.build(), errorFxn);
  // if (!response.success) return response;

  // const currentBlock = response.blockHeight;
  // try {
  //   await awaitBlock(currentBlock);
  //   const lobbyState = await retryPromise(
  //     () => getLobbyStateWithUser(lobbyID, userWalletAddress),
  //     RETRY_PERIOD,
  //     RETRIES_COUNT
  //   );
  //   if (userJoinedLobby(userWalletAddress, lobbyState)) {
      return { success: true, message: '' };
  //   }
  //   if (userCreatedLobby(userWalletAddress, lobbyState)) {
  //     return errorFxn(MiddlewareErrorCode.CANNOT_JOIN_OWN_LOBBY);
  //   }
  //   return errorFxn(MiddlewareErrorCode.FAILURE_VERIFYING_LOBBY_JOIN);
  // } catch (err) {
  //   return errorFxn(MiddlewareErrorCode.FAILURE_VERIFYING_LOBBY_JOIN, err);
  // }
}

async function closeLobby(lobbyID: string): Promise<OldResult> {
  // const errorFxn = buildEndpointErrorFxn('closeLobby');

  // const query = getUserWallet(errorFxn);
  // if (!query.success) return query;
  // const userWalletAddress = query.result;

  // const conciseBuilder = builder.initialize(undefined);
  // conciseBuilder.setPrefix('cs');
  // conciseBuilder.addValue({ value: lobbyID, isStateIdentifier: true });

  // const response = await postConciseData(conciseBuilder.build(), errorFxn);
  // if (!response.success) return response;

  // const currentBlock = response.blockHeight;
  // try {
  //   await awaitBlock(currentBlock);
  //   const lobbyState = await retryPromise(
  //     () => getLobbyStateWithUser(lobbyID, userWalletAddress),
  //     RETRY_PERIOD,
  //     RETRIES_COUNT
  //   );
  //   if (lobbyWasClosed(lobbyState)) {
      return { success: true, message: '' };
  //   }
  //   if (!userCreatedLobby(userWalletAddress, lobbyState)) {
  //     return errorFxn(MiddlewareErrorCode.CANNOT_CLOSE_SOMEONES_LOBBY);
  //   }
  //   return errorFxn(MiddlewareErrorCode.FAILURE_VERIFYING_LOBBY_CLOSE);
  // } catch (err) {
  //   return errorFxn(MiddlewareErrorCode.FAILURE_VERIFYING_LOBBY_CLOSE, err);
  // }
}

async function submitMoves(
  lobbyID: string,
  roundNumber: number,
  move: MatchMove
): Promise<FailedResult | PackedLobbyState> {
  // const errorFxn = buildEndpointErrorFxn('submitMoves');

  // const query = getUserWallet(errorFxn);
  // if (!query.success) return query;
  // const userWalletAddress = query.result;

  // const conciseBuilder = builder.initialize(undefined);
  // conciseBuilder.setPrefix('s');
  // conciseBuilder.addValue({ value: lobbyID, isStateIdentifier: true });
  // conciseBuilder.addValue({ value: roundNumber.toString(10) });
  // conciseBuilder.addValue({ value: move });

  // const response = await postConciseData(conciseBuilder.build(), errorFxn);
  // if (!response.success) return response;

  // const currentBlock = response.blockHeight;
  // try {
  //   await awaitBlock(currentBlock);
  //   const lobbyState = await retryPromise(
  //     () => getLobbyStateWithUser(lobbyID, userWalletAddress),
  //     RETRY_PERIOD,
  //     RETRIES_COUNT
  //   );
  //   if (lobbyState.success) {
      // return lobbyState;
  //   }
  //   return errorFxn(MiddlewareErrorCode.FAILURE_VERIFYING_MOVE_SUBMISSION);
  // } catch (err) {
  //   return errorFxn(MiddlewareErrorCode.FAILURE_VERIFYING_MOVE_SUBMISSION, err);
  // }
  return {
    success: true,
    lobby: {
      lobby_id: lobbyID,
      lobby_state: 'open',
      round_ends_in_blocks: 1,
      round_ends_in_secs: 1,
      round_start_height: 1,
      remaining_blocks: { w: 1, b: 1 },
      current_round: 1,
      round_length: 1,
      bot_difficulty: 0,
      created_at: new Date(),
      creation_block_height: 0,
      hidden: false,
      latest_match_state: "",
      lobby_creator: "",
      num_of_rounds: 0,
      play_time_per_player: 0,
      player_one_iswhite: false,
      player_two: null,
      practice: false
    },
  };
}

export const writeEndpoints = {
  createLobby,
  joinLobby,
  closeLobby,
  submitMoves,
};
