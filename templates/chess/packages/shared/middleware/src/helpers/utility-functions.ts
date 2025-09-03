import type { PackedLobbyState, RoundEnd } from "../types.ts";

// HELPERS

export type ErrorCode = number;
export type ErrorMessageMapping = Record<ErrorCode, string>;

export type ErrorMessageFxn = (errorCode: ErrorCode) => string;

export interface SuccessfulResultMessage {
  success: true;
  message: string;
}

export interface SuccessfulResult<T> {
  success: true;
  result: T;
}

export interface FailedResult {
  success: false;
  errorMessage: string;
  errorCode?: number;
}

export type Result<T> = SuccessfulResult<T> | FailedResult;

// TODO: delete this
export type OldResult = SuccessfulResultMessage | FailedResult;

export type InternalServerErrorResult = FailedResult;

/** comes from the `tsoa` package, but we don't want it as a dependency just for this type  */
export interface FieldErrors {
  [name: string]: {
    message: string;
    value?: any;
  };
}
interface ValidateErrorResult {
  message: "Validation Failed";
  details?: FieldErrors;
}

type EndpointErrorFxn = (
  errorDescription: string,
  err?: any,
  errorCode?: number,
) => FailedResult;

function buildAbstractEndpointErrorFxn(
  errorMessageFxn: ErrorMessageFxn,
  endpointName: string,
): EndpointErrorFxn {
  return function (
    errorDescription: ErrorCode | string,
    err?: any,
    errorCode?: number,
  ) {
    let msg: string = "";
    let errorOccurred: boolean = false;

    if (typeof errorDescription === "string") {
      msg = errorDescription;
      errorOccurred = msg !== "";
    } else {
      const errorCode = errorDescription;
      errorOccurred = errorCode !== 0;
      msg = errorMessageFxn(errorCode);
    }

    if (errorOccurred) {
      console.log(`[${endpointName}] ${msg}`);
    }
    if (err) {
      console.log(`[${endpointName}] error:`, err);
    }
    return {
      success: false,
      errorMessage: msg,
      errorCode: 1,
    };
  };
}

export function buildErrorCodeTranslator(
  obj: ErrorMessageMapping,
): ErrorMessageFxn {
  return function (errorCode: ErrorCode): string {
    if (!obj.hasOwnProperty(errorCode)) {
      return "Unknown error code: " + errorCode;
    } else {
      return obj[errorCode];
    }
  };
}

const PAIMA_MIDDLEWARE_ERROR_MESSAGES: Record<string, string> = {};
const paimaErrorMessageFxn: ErrorMessageFxn = buildErrorCodeTranslator(
  PAIMA_MIDDLEWARE_ERROR_MESSAGES,
);

export function buildEndpointErrorFxn(endpointName: string): EndpointErrorFxn {
  return buildAbstractEndpointErrorFxn(paimaErrorMessageFxn, endpointName);
}

// END HELPERS

export function userJoinedLobby(
  address: String,
  lobby: PackedLobbyState,
): boolean {
  if (!lobby.hasOwnProperty("lobby")) {
    return false;
  }
  const lobbyState = lobby.lobby;

  if (!lobbyState.hasOwnProperty("player_two")) {
    return false;
  }
  if (!lobbyState.player_two || !address) {
    return false;
  }
  return lobbyState.player_two.toLowerCase() === address.toLowerCase();
}

export function userCreatedLobby(
  address: String,
  lobby: PackedLobbyState,
): boolean {
  if (!lobby.hasOwnProperty("lobby")) {
    return false;
  }
  const lobbyState = lobby.lobby;

  if (!lobbyState.hasOwnProperty("lobby_creator")) {
    return false;
  }
  if (!lobbyState.lobby_creator || !address) {
    return false;
  }
  return lobbyState.lobby_creator.toLowerCase() === address.toLowerCase();
}

export function lobbyWasClosed(lobby: PackedLobbyState): boolean {
  const { lobby: lobbyState } = lobby;
  if (!lobbyState) {
    return false;
  }

  return lobbyState.lobby_state === "closed";
}

export function calculateRoundEnd(
  roundStart: number,
  roundLength: number,
  current: number,
): RoundEnd {
  const errorFxn = buildEndpointErrorFxn("calculateRoundEnd");

  let roundEnd = roundStart + roundLength;
  if (roundEnd < current) {
    errorFxn("CALCULATED_ROUND_END_IN_PAST");
    roundEnd = current;
  }

  const blocksToEnd = roundEnd - current;
  const secondsToEnd = blocksToEnd * 1000; // ENV.BLOCK_TIME;
  return {
    blocks: blocksToEnd,
    seconds: secondsToEnd,
  };
}
