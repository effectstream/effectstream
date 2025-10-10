import type {
  ActiveConnection,
  IConnector,
  IInjectedConnector,
  IProvider,
} from "./IProvider.ts";

// import { AlgorandConnector } from "./algorand/algorand.ts";
import { EthersConnector } from "./evm/ethers.ts";
import { EvmInjectedConnector } from "./evm/injected.ts";
import { CardanoConnector } from "./cardano/cardano.ts";
// import { PolkadotConnector } from "./polkadot/polkadot.ts";
import { MinaConnector } from "./mina/mina.ts";
import { AvailConnector } from "./avail/avail.ts";
import { MidnightConnector } from "./midnight/midnight.ts";

export const enum WalletMode {
  EvmInjected,
  EvmEthers,
  Midnight,
  Cardano,
  Polkadot,
  Algorand,
  Mina,
  AvailJs,
}

export const WalletNameMap: Record<WalletMode, string> = {
  [WalletMode.EvmInjected]: 'EVM',
  [WalletMode.EvmEthers]: 'EVM',
  [WalletMode.Midnight]: 'Midnight',
  [WalletMode.Cardano]: 'Cardano',
  // [WalletMode.Polkadot]: 'Polkadot',
  // [WalletMode.Algorand]: 'Algorand',
  [WalletMode.Mina]: 'Mina',
  [WalletMode.AvailJs]: 'Avail',
};


export const WalletModeMap = {
  [WalletMode.EvmInjected]: EvmInjectedConnector.instance(),
  [WalletMode.EvmEthers]: EthersConnector.instance(),
  [WalletMode.Midnight]: MidnightConnector.instance(),
  [WalletMode.Cardano]: CardanoConnector.instance(),
  // [WalletMode.Polkadot]: PolkadotConnector.instance(),
  // [WalletMode.Algorand]: AlgorandConnector.instance(),
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

export async function allInjectedWallets(): Promise<{
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
  return {
    [WalletMode.EvmInjected]: EvmInjectedConnector.getWalletOptions(),
    [WalletMode.Cardano]: CardanoConnector.getWalletOptions(),
    [WalletMode.Polkadot]: await PolkadotConnector.getWalletOptions(),
    [WalletMode.Algorand]: AlgorandConnector.getWalletOptions(),
    [WalletMode.Mina]: MinaConnector.getWalletOptions(),
    [WalletMode.Midnight]: MidnightConnector.getWalletOptions(),
  };
}
export async function connectInjectedWallet<Api>(
  typeName: string,
  preference: undefined | InjectionPreference<Api>,
  connector: IInjectedConnector<Api>
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
  Func extends keyof IProvider<Api>
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
