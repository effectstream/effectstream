// import { buildEndpointErrorFxn, PaimaMiddlewareErrorCode } from '../errors.js';
// import { getGameName } from '../state.js';
// import type { LoginInfoMap } from '../types.js';
// import { PolkadotConnector } from '@effectstream/providers';
// import type { ApiForMode, IProvider, WalletMode } from '@effectstream/providers';
// import { connectInjected } from './wallet-modes.js';
// import type { Result } from '@effectstream/utils';

import type { Result } from "@effectstream/utils";
import type { IProvider } from "../IProvider.ts";
import type { WalletMode, ApiForMode } from "../utils.ts";
import { type LoginInfoMap, connectInjected } from "../wallet-modes.ts";
import { PolkadotConnector } from "./polkadot.ts";

export async function polkadotLoginWrapper(
  loginInfo: LoginInfoMap[WalletMode.Polkadot]
): Promise<Result<IProvider<ApiForMode<WalletMode.Polkadot>>>> {
  const loginResult = await connectInjected(
    'polkadotLoginWrapper',
    loginInfo,
    PolkadotConnector.instance()
  );
  if (loginResult.success === false) {
    return loginResult;
  }
  return {
    success: true,
    result: loginResult.result,
  };
}
