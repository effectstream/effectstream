// import type { ErrorMessageFxn } from '@paimaexample/sdk/utils';
// import { buildErrorCodeTranslator } from '@paimaexample/sdk/utils';
// import type { EndpointErrorFxn } from '@paimaexample/sdk/mw-core';
// import {
//   PaimaMiddlewareErrorCode,
//   PAIMA_MIDDLEWARE_ERROR_MESSAGES,
//   buildAbstractEndpointErrorFxn,
// } from '@paimaexample/sdk/mw-core';

// export const enum MiddlewareErrorCode {
//   GENERIC_ERROR = PaimaMiddlewareErrorCode.FINAL_PAIMA_GENERIC_ERROR + 1,
//   // Query endpoint related:
//   CALCULATED_ROUND_END_IN_PAST,
//   UNABLE_TO_BUILD_EXECUTOR,
//   NO_OPEN_LOBBIES,
//   // Write endpoint related:
//   FAILURE_VERIFYING_LOBBY_CREATION,
//   FAILURE_VERIFYING_LOBBY_CLOSE,
//   FAILURE_VERIFYING_LOBBY_JOIN,
//   FAILURE_VERIFYING_MOVE_SUBMISSION,
//   CANNOT_JOIN_OWN_LOBBY,
//   CANNOT_CLOSE_SOMEONES_LOBBY,
// }

// type ErrorMessageMapping = Record<MiddlewareErrorCode, string>;
// const MIDDLEWARE_ERROR_MESSAGES: ErrorMessageMapping = {
//   [MiddlewareErrorCode.GENERIC_ERROR]: 'Unspecified generic Game error',
//   [MiddlewareErrorCode.CALCULATED_ROUND_END_IN_PAST]: 'Calculated round end is in the past',
//   [MiddlewareErrorCode.UNABLE_TO_BUILD_EXECUTOR]:
//     'Unable to build executor from data returned from server -- executor might not exist',
//   [MiddlewareErrorCode.NO_OPEN_LOBBIES]: 'No open lobbies were found, please try again later',
//   [MiddlewareErrorCode.FAILURE_VERIFYING_LOBBY_CREATION]: 'Failure while verifying lobby creation',
//   [MiddlewareErrorCode.FAILURE_VERIFYING_LOBBY_CLOSE]: 'Failure while verifying lobby closing',
//   [MiddlewareErrorCode.FAILURE_VERIFYING_LOBBY_JOIN]: 'Failure while verifying lobby join',
//   [MiddlewareErrorCode.FAILURE_VERIFYING_MOVE_SUBMISSION]:
//     'Failure while verifying move submission',
//   [MiddlewareErrorCode.CANNOT_JOIN_OWN_LOBBY]: 'Cannot join your own lobby',
//   [MiddlewareErrorCode.CANNOT_CLOSE_SOMEONES_LOBBY]: 'Cannot close lobby created by someone else',
// };

// const errorMessageFxn: ErrorMessageFxn = buildErrorCodeTranslator({
//   ...PAIMA_MIDDLEWARE_ERROR_MESSAGES,
//   ...MIDDLEWARE_ERROR_MESSAGES,
// });

// export function buildEndpointErrorFxn(endpointName: string): EndpointErrorFxn {
//   return buildAbstractEndpointErrorFxn(errorMessageFxn, endpointName);
// }
