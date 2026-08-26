import type { ApiPromise } from "avail-js-sdk";
import type { Result } from "@effectstream/utils/types";
import type { AlgorandApi } from "./algorand/algorand.ts";
import type { CardanoApi } from "./cardano/cardano.ts";
import type { CardanoLocalNetwork } from "./cardano/local.ts";
import type { EthersApi } from "./evm/ethers.ts";
import type { ViemApi } from "./evm/viem.ts";
import type { EvmApi } from "./evm/injected.ts";
import type { Hex } from "viem";
import type {
  ActiveConnection,
  IInjectedConnector,
  IProvider,
} from "./IProvider.ts";
import type { MinaApi } from "./mina/mina.ts";
import type { PolkadotApi } from "./polkadot/polkadot.ts";
import {
  connectInjectedWallet,
  type InjectionPreference,
  WalletMode,
} from "./utils.ts";
import { AddressType } from "@effectstream/utils/types";
import { formatError } from "./helpers/format-error.ts";
import type { MidnightApi } from "./midnight/midnight.ts";
import type { MidnightLocalConnectArgs } from "./midnight/local.ts";
import type { SolanaApi } from "./solana/solana.ts";
import type { Chain } from "viem/chains";
import { Wallet } from "ethers";

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
  [WalletMode.EvmViem]: {
    /** 0x-prefixed 32-byte hex private key. */
    privateKey: Hex;
    /** RPC URL the viem WalletClient should target. */
    rpcUrl: string;
    /** Optional viem Chain — pass to enable chain-aware tx fields (chainId etc). */
    chain?: Chain;
    /** If true, even EVM inputs are batched (sign + send to batcher). */
    preferBatchedMode?: boolean;
  };
  [WalletMode.Cardano]: BaseLoginInfo<CardanoApi>;
  [WalletMode.CardanoLocal]: {
    /** BIP-39 mnemonic. Generated when omitted. */
    seedPhrase?: string;
    /** Cardano network — sets the bech32 prefix. */
    network: CardanoLocalNetwork;
    /** Optional Lucid Provider; only needed for on-chain ops, not pure signing. */
    provider?: unknown;
  };
  [WalletMode.Polkadot]: BaseLoginInfo<PolkadotApi>;
  [WalletMode.Algorand]: BaseLoginInfo<AlgorandApi>;
  [WalletMode.Mina]: BaseLoginInfo<MinaApi>;
  [WalletMode.AvailJs]: {
    connection: ActiveConnection<ApiPromise>;
    preferBatchedMode: boolean;
    seed: string;
  };
  [WalletMode.Midnight]: BaseLoginInfo<MidnightApi> & {
    networkId?: string;
  };
  [WalletMode.MidnightLocal]: MidnightLocalConnectArgs;
  [WalletMode.Solana]: BaseLoginInfo<SolanaApi>;
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
      errorMessage: formatError(err),
    };
  }
}

export function getAddressType(mode: WalletMode): AddressType {
  switch (mode) {

    case WalletMode.EvmInjected:
    case WalletMode.EvmEthers:
    case WalletMode.EvmViem:
      return AddressType.EVM;
    case WalletMode.Cardano:
    case WalletMode.CardanoLocal:
      return AddressType.CARDANO;
    case WalletMode.Polkadot:
      return AddressType.POLKADOT;
    case WalletMode.Algorand:
      return AddressType.ALGORAND;
    case WalletMode.Mina:
      return AddressType.MINA;
    case WalletMode.Midnight:
    case WalletMode.MidnightLocal:
      return AddressType.MIDNIGHT;
    case WalletMode.AvailJs:
      return AddressType.AVAIL;
    case WalletMode.Solana:
      return AddressType.SOLANA;
    default:
      throw new Error(`Unsupported wallet mode: ${mode}`);
  }
};
