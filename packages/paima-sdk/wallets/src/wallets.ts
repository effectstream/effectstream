import type { IProvider } from "./IProvider.ts";
import { algorandLoginWrapper } from "./algorand/wrapper.ts";
import { cardanoLoginWrapper } from "./cardano/wrapper.ts";
import { evmLoginWrapper } from "./evm/wrapper-injected.ts";
import { polkadotLoginWrapper } from "./polkadot/wrapper.ts";
import { ethersLoginWrapper } from "./evm/wrapper-ethers.ts";
import { minaLoginWrapper } from "./mina/wrapper.ts";
import { availJsLoginWrapper } from "./avail/wrapper.ts";
import { WalletMode } from "./utils.ts";
import type { Result } from "@paima/utils";
import type { Wallet } from "./types.ts";
import type { LoginInfo } from "./wallet-modes.ts";
import { assertNever } from "assert-never";

export async function walletLogin(
  loginInfo: LoginInfo
): Promise<Result<Wallet>> {
  const provider = await (async (): Promise<Result<IProvider<unknown>>> => {
    switch (loginInfo.mode) {
      case WalletMode.EvmInjected: {
        return await evmLoginWrapper(loginInfo);
      }
      case WalletMode.EvmEthers: {
        return await ethersLoginWrapper(loginInfo);
      }
      case WalletMode.Cardano: {
        return await cardanoLoginWrapper(loginInfo);
      }
      case WalletMode.Polkadot: {
        return await polkadotLoginWrapper(loginInfo);
      }
      case WalletMode.Algorand: {
        return await algorandLoginWrapper(loginInfo);
      }
      case WalletMode.Mina: {
        return await minaLoginWrapper(loginInfo);
      }
      case WalletMode.AvailJs: {
        return await availJsLoginWrapper(loginInfo);
      }
      default:
        assertNever(loginInfo, true);
    }
  })();
  if (provider.success === false) return provider;

  return {
    success: true,
    result: {
      walletAddress: provider.result.getAddress().address,
      metadata: provider.result.getConnection().metadata,
    },
  };
}
