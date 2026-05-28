import type {
  ActiveConnection,
  IConnector,
  IInjectedConnector,
  IProvider,
} from "./IProvider.ts";

import { AlgorandConnector } from "./algorand/algorand.ts";
import { EthersConnector } from "./evm/ethers.ts";
import { ViemConnector } from "./evm/viem.ts";
import { EvmInjectedConnector } from "./evm/injected.ts";
import { CardanoConnector } from "./cardano/cardano.ts";
import { CardanoLocalConnector } from "./cardano/local.ts";
import { PolkadotConnector } from "./polkadot/polkadot.ts";
import { MinaConnector } from "./mina/mina.ts";
import { AvailConnector } from "./avail/avail.ts";
import { MidnightConnector } from "./midnight/midnight.ts";
import { MidnightLocalConnector } from "./midnight/local.ts";

export const enum WalletMode {
  EvmInjected,
  EvmEthers,
  EvmViem,
  Midnight,
  MidnightLocal,
  Cardano,
  CardanoLocal,
  Polkadot,
  Algorand,
  Mina,
  AvailJs,
}

export const WalletNameMap: Record<WalletMode, string> = {
  [WalletMode.EvmInjected]: "EVM",
  [WalletMode.EvmEthers]: "EVM",
  [WalletMode.EvmViem]: "EVM",
  [WalletMode.Midnight]: "Midnight",
  [WalletMode.MidnightLocal]: "Midnight",
  [WalletMode.Cardano]: "Cardano",
  [WalletMode.CardanoLocal]: "Cardano",
  [WalletMode.Polkadot]: 'Polkadot',
  [WalletMode.Algorand]: 'Algorand',
  [WalletMode.Mina]: "Mina",
  [WalletMode.AvailJs]: "Avail",
};

export const WalletModeMap = {
  [WalletMode.EvmInjected]: EvmInjectedConnector.instance(),
  [WalletMode.EvmEthers]: EthersConnector.instance(),
  [WalletMode.EvmViem]: ViemConnector.instance(),
  [WalletMode.Midnight]: MidnightConnector.instance(),
  [WalletMode.MidnightLocal]: MidnightLocalConnector.instance(),
  [WalletMode.Cardano]: CardanoConnector.instance(),
  [WalletMode.CardanoLocal]: CardanoLocalConnector.instance(),
  [WalletMode.Polkadot]: PolkadotConnector.instance(),
  [WalletMode.Algorand]: AlgorandConnector.instance(),
  [WalletMode.Mina]: MinaConnector.instance(),
  [WalletMode.AvailJs]: AvailConnector.instance(),
};

type ExtractGeneric<T> = T extends IConnector<infer U> ? U : never;
export type ApiForMode<Mode extends WalletMode> = ExtractGeneric<
  (typeof WalletModeMap)[Mode]
>;

export type InjectionPreference<T> =
  | {
    name: string;
  }
  | {
    connection: ActiveConnection<T>;
  };

export async function allInjectedWallets(config: {
  signatureSupport: boolean,
  transactionSupport: boolean,
} = { 
  signatureSupport: true,
  transactionSupport: true,
}): Promise<{
  [WalletMode.EvmInjected]: ReturnType<
    typeof EvmInjectedConnector.getWalletOptions
  >;
  [WalletMode.Cardano]: ReturnType<typeof CardanoConnector.getWalletOptions>;
  [WalletMode.Polkadot]: Awaited<
    ReturnType<typeof PolkadotConnector.getWalletOptions>
  >;
  [WalletMode.Algorand]: ReturnType<typeof AlgorandConnector.getWalletOptions>;
  [WalletMode.Mina]: ReturnType<typeof MinaConnector.getWalletOptions>;
  [WalletMode.Midnight]: ReturnType<typeof MidnightConnector.getWalletOptions>;
}> {
  const signatureSupport = config.signatureSupport;
  const transactionSupport = config.transactionSupport;
  const wallets = {
    // EVM, CARDANO, MINA, POLKADOR Wallets have full support for signatures and transactions.
    [WalletMode.EvmInjected]: EvmInjectedConnector.getWalletOptions(),
    [WalletMode.Cardano]: CardanoConnector.getWalletOptions(),
    [WalletMode.Polkadot]: await PolkadotConnector.getWalletOptions(),
    [WalletMode.Mina]: MinaConnector.getWalletOptions(),
    // TODO: Algorand signature support is not implemented yet.
    [WalletMode.Algorand]: signatureSupport? [] : AlgorandConnector.getWalletOptions(),
    // Midnight signing via ConnectedAPI.signData(message, {keyType: "unshielded"})
    // works as of @effectstream/crypto's MidnightCrypto.verifySignature
    // implementation, so it now surfaces in the injected-wallet list even when
    // signature support is requested.
    [WalletMode.Midnight]: MidnightConnector.getWalletOptions(),
  };

  return wallets;
}
export async function connectInjectedWallet<Api>(
  typeName: string,
  preference: undefined | InjectionPreference<Api>,
  connector: IInjectedConnector<Api>,
): Promise<IProvider<Api>> {
  if (preference == null) {
    console.log(`${typeName} Attempting simple login`);
    const provider = await connector.connectSimple();
    return provider;
  } else if ("name" in preference) {
    const walletName = preference.name;
    console.log(`${typeName} Attempting to log into ${walletName}`);
    const provider = await connector.connectNamed(walletName);
    return provider;
  } else if ("connection" in preference) {
    const walletName = preference.connection.metadata.name;
    console.log(`${typeName} Attempting to log into ${walletName}`);
    const provider = await connector.connectExternal(preference.connection);
    return provider;
  }
  throw new Error("Invalid preference");
}

export function callProvider<
  Mode extends WalletMode,
  Api extends ApiForMode<Mode>,
  Func extends keyof IProvider<Api>,
>(
  mode: Mode,
  funcName: Func,
  ...args: Parameters<IProvider<Api>[Func]>
): ReturnType<IProvider<Api>[Func]> {
  const provider = WalletModeMap[mode].getOrThrowProvider();
  const func = provider[funcName];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (func as any)(...args);
}
