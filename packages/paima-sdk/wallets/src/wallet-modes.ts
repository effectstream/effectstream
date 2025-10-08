import type { ApiPromise } from "avail-js-sdk";
import type { Result } from "@paima/utils";
// import type { AlgorandApi } from "./algorand/algorand.ts";
import type { CardanoApi } from "./cardano/cardano.ts";
import type { EthersApi } from "./evm/ethers.ts";
import type { EvmApi } from "./evm/injected.ts";
import type {
  ActiveConnection,
  IInjectedConnector,
  IProvider,
} from "./IProvider.ts";
import type { MinaApi } from "./mina/mina.ts";
// import type { PolkadotApi } from "./polkadot/polkadot.ts";
import {
  connectInjectedWallet,
  type InjectionPreference,
  type WalletMode,
} from "./utils.ts";
import type { MidnightApi } from "./midnight/midnight.ts";
import type { Chain } from "viem/chains";

export type BaseLoginInfo<Api> = {
  preference?: InjectionPreference<Api>;
};
export type LoginInfoMap = {
  [WalletMode.EvmInjected]: BaseLoginInfo<EvmApi> & {
    /** If true even EVM wallet inputs will be batched (sign data and send to the batcher) */
    preferBatchedMode: boolean;
    /**
     * By default, Paima will try and switch the wallet's network to the one used for the game
     * This uses EIP3326 (https://eips.ethereum.org/EIPS/eip-3326)
     * This may not be desired, since not all wallets support switching to an arbitrary network
     * Set to false if you only need to sign data. Otherwise, keep as true
     * @default true
     */
    checkChainId?: boolean;
    chain?: Chain;
  };
  [WalletMode.EvmEthers]: {
    connection: ActiveConnection<EthersApi>;
    preferBatchedMode: boolean;
  };
  [WalletMode.Cardano]: BaseLoginInfo<CardanoApi>;
  // [WalletMode.Polkadot]: BaseLoginInfo<PolkadotApi>;
  // [WalletMode.Algorand]: BaseLoginInfo<AlgorandApi>;
  [WalletMode.Mina]: BaseLoginInfo<MinaApi>;
  [WalletMode.AvailJs]: {
    connection: ActiveConnection<ApiPromise>;
    preferBatchedMode: boolean;
    seed: string;
  };
  [WalletMode.Midnight]: BaseLoginInfo<MidnightApi>;
};

type ToUnion<T> = {
  [K in keyof T]: { mode: K } & T[K];
}[keyof T];

export type LoginInfo = ToUnion<LoginInfoMap>;

function getWalletName(info: BaseLoginInfo<unknown>): undefined | string {
  if (info.preference == null) return undefined;
  if ("name" in info.preference) {
    return info.preference.name;
  }
  return info.preference.connection.metadata.name;
}
export async function connectInjected<Api>(
  typeName: string,
  loginInfo: BaseLoginInfo<Api>,
  connector: IInjectedConnector<Api>,
): Promise<Result<IProvider<Api>>> {
  try {
    const provider = await connectInjectedWallet(
      typeName,
      loginInfo.preference,
      connector,
    );
    return {
      success: true,
      result: provider,
    };
  } catch (err) {
    console.log(
      `${typeName} Error while logging into wallet ${
        getWalletName(loginInfo) ?? "simple"
      }`,
    );

    return {
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}
