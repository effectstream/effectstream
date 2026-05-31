import {WalletMode, type LoginInfo} from '@effectstream/wallets';

// Map the wallet-selection dropdown value (see site/index.html #wallet_dropdown)
// to a @effectstream/wallets LoginInfo. Hex Battle is an EVM template, so we
// expose BOTH an injected wallet (MetaMask / browser) and a local-JS wallet
// (viem, used for dev + headless e2e). The middleware (paima/middleware.ts)
// fills in the local key + RPC for the EvmViem branch.
export function nameToLogin(
  name: string,
  preferBatchedMode: boolean
): LoginInfo {
  switch (name) {
    case 'metamask':
    case 'browser': {
      return {
        mode: WalletMode.EvmInjected,
        preferBatchedMode,
      } as LoginInfo;
    }
    case 'local':
    case 'viem': {
      // Connection details (privateKey/rpcUrl/chain) are added in
      // userWalletLogin so the dropdown only needs to pick the mode.
      return {
        mode: WalletMode.EvmViem,
      } as LoginInfo;
    }
    default:
      throw new Error(`Unknown wallet "${name}"`);
  }
}
