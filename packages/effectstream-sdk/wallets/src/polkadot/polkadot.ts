import type {
  InjectedExtension,
  InjectedWindowProvider,
} from "@polkadot/extension-inject/types";
import { AddressType } from "@effectstream/utils";
import {
  type IConnector,
  type IInjectedConnector,
  type ConnectionOption,
  type ActiveConnection,
  optionToActive,
  type IProvider,
  type AddressAndType,
  type UserSignature,
} from "../IProvider.ts";
import { web3Enable, web3FromSource } from "@polkadot/extension-dapp";
import { utf8ToHex } from "web3-utils";
import { getWindow } from "../windows.ts";

import { web3Accounts, web3FromAddress } from "@polkadot/extension-dapp";
export type PolkadotAddress = string;
export type PolkadotApi = InjectedExtension;

// declare global {
//   interface Window {
//     injectedWeb3?: Record<string, InjectedWindowProvider>;
//   }
// }

export class PolkadotConnector
  implements IConnector<PolkadotApi>, IInjectedConnector<PolkadotApi>
{
  private provider: PolkadotProvider | undefined;
  private static INSTANCE: undefined | PolkadotConnector = undefined;

  static async getWalletOptions(): Promise<ConnectionOption<PolkadotApi>[]> {
    const injectedWeb3: Record<string, InjectedWindowProvider> = (getWindow() as any)?.injectedWeb3;
    if (injectedWeb3 == null) return [];
    return Object.keys(injectedWeb3).map((wallet) => ({
      metadata: {
        name: wallet,
        // polkadot provides no way to get a human-friendly name or icon for wallets
        displayName: wallet,
      },
      api: async (): Promise<PolkadotApi> => {
        // const { web3Enable, web3FromSource } = await import('@polkadot/extension-dapp');
        await web3Enable(/*gameName*/ "paima");
        const injector = await web3FromSource(wallet);
        return injector;
      },
    }));
  }

  static instance(): PolkadotConnector {
    if (PolkadotConnector.INSTANCE == null) {
      const newInstance = new PolkadotConnector();
      PolkadotConnector.INSTANCE = newInstance;
    }
    return PolkadotConnector.INSTANCE;
  }
  connectSimple = async (): Promise<PolkadotProvider> => {
    if (this.provider != null) {
      return this.provider;
    }

    const extensions = await web3Enable(/*gameName*/ "paima");
    if (extensions.length === 0) {
      throw new Error(`[polkadot] no extension detected`);
    }

    // we get all accounts instead of picking a specific extension
    // because some extensions could have no accounts in them
    const allAccounts = await web3Accounts();
    for (const account of allAccounts) {
      const injector = await web3FromAddress(account.address);
      if (injector.signer.signRaw == null) continue;
      return await this.connectExternal({
        metadata: {
          name: account.meta.source,
          // polkadot provides no way to get a human-friendly name or icon for wallets
          displayName: account.meta.source,
        },
        api: injector,
      });
    }
    throw new Error("[polkadot] No account detected that supports signing! Found extensions: " + extensions.map(e => e.name).join(", "));
  };
  connectExternal = async (
    conn: ActiveConnection<PolkadotApi>
  ): Promise<PolkadotProvider> => {
    if (this.provider?.getConnection().metadata?.name === conn.metadata.name) {
      return this.provider;
    }
    this.provider = await PolkadotProvider.init(conn);
    return this.provider;
  };
  connectNamed = async (name: string): Promise<PolkadotProvider> => {
    if (this.provider?.getConnection().metadata?.name === name) {
      return this.provider;
    }
    const provider = (await PolkadotConnector.getWalletOptions()).find(
      (entry) => entry.metadata.name === name
    );
    if (provider == null) {
      throw new Error(`Polkadot wallet ${name} not found`);
    }
    return await this.connectExternal(await optionToActive(provider));
  };
  getProvider = (): undefined | PolkadotProvider => {
    return this.provider;
  };
  getOrThrowProvider = (): PolkadotProvider => {
    if (this.provider == null) {
      throw new Error(`PolkadotConnector not initialized yet`);
    }
    return this.provider;
  };
  isConnected = (): boolean => {
    return this.provider != null;
  };
}

export class PolkadotProvider implements IProvider<PolkadotApi> {
  constructor(
    private readonly conn: ActiveConnection<PolkadotApi>,
    readonly address: PolkadotAddress
  ) {}
  static init = async (
    conn: ActiveConnection<PolkadotApi>
  ): Promise<PolkadotProvider> => {
    const account = (await conn.api.accounts.get(false))[0]?.address;
    if (account == null) {
      throw new Error("Unknown error while receiving Polkadot accounts");
    }

    return new PolkadotProvider(conn, account);
  };
  getConnection = (): ActiveConnection<PolkadotApi> => {
    return this.conn;
  };
  getAddress = (): AddressAndType => {
    return {
      type: AddressType.POLKADOT,
      address: this.address,
    };
  };
  signMessage = async (message: string): Promise<UserSignature> => {
    if (this.conn.api.signer.signRaw == null) {
      throw new Error(
        `[polkadot] extension ${this.conn.metadata.name} does not support signRaw`
      );
    }
    const hexMessage = utf8ToHex(message);
    const { signature } = await this.conn.api.signer.signRaw({
      address: this.getAddress().address,
      data: hexMessage,
      type: "bytes",
    });
    return signature;
  };
}
