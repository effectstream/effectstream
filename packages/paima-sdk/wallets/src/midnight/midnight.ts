import { AddressType, type MidnightAddress } from "@paima/utils";
import {
  type IInjectedConnector,
  type ActiveConnection,
  type IProvider,
  type AddressAndType,
  type UserSignature,
  type IConnector,
  type ConnectionOption,
  optionToActive,
} from "../IProvider.ts";
import { getWindow } from "../windows.ts";

// TODO: proper type definitions for MidnightApi
export type MidnightApi = any;

// TODO Implement this class
export class MidnightConnector implements IConnector<MidnightApi>, IInjectedConnector<MidnightApi> {
  private provider: MidnightProvider | undefined;
  private static INSTANCE: undefined | MidnightConnector = undefined;
  
  static getWalletOptions(): ConnectionOption<MidnightApi>[] {
    const midnightApi: Record<string, { name?: string; enable?: () => Promise<MidnightApi> }> = (getWindow() as any)?.midnight;
    if (midnightApi == null) return [];

    const options = Object.entries(midnightApi).reduce((options, [key, info]) => {
      if (info.name != null && info.enable != null && info.name === 'lace') {
        options.push({
          metadata: {
            name: key,
            displayName: info.name,
            icon: 'icon' in info ? (info.icon as string) : undefined,
          },
          api: info.enable,
        });
      }
      return options;
    }, [] as ConnectionOption<MidnightApi>[]);
    return options;
  }
  
  static instance(): MidnightConnector {
    if (MidnightConnector.INSTANCE == null) {
      const newInstance = new MidnightConnector();
      MidnightConnector.INSTANCE = newInstance;
    }
    return MidnightConnector.INSTANCE;
  }

  getOrThrowProvider = (): MidnightProvider => {
    if (this.provider == null) {
      throw new Error(`MidnightConnector provider isn't initialized yet`);
    }
    return this.provider;
  };
  
  getProvider = (): undefined | MidnightProvider => {
    return this.provider;
  };

  isConnected(): boolean {
    return this.provider != null;
  }

  connectSimple = async (): Promise<MidnightProvider> => {
    if (this.provider != null) {
      return this.provider;
    }
    const options = MidnightConnector.getWalletOptions();
    if (options.length === 0) {
      throw new Error(`No Midnight wallet found`);
    }

    return await this.connectExternal(await optionToActive(options[0]));
  };

  connectNamed = async (name: string): Promise<MidnightProvider> => {
    if (this.provider?.getConnection().metadata?.name === name) {
      return this.provider;
    }
    const provider = MidnightConnector.getWalletOptions().find(
      entry => entry.metadata.name === name
    );
    if (provider == null) {
      throw new Error(`Midnight wallet ${name} not found`);
    }
    return await this.connectExternal(await optionToActive(provider));
  }

  connectExternal = async (conn: ActiveConnection<MidnightApi>): Promise<MidnightProvider> => {
    if (this.provider?.getConnection().metadata?.name === conn.metadata.name) {
      return this.provider;
    }
    this.provider = await MidnightProvider.init(conn);
    return this.provider;
  }

}

// TODO Implement this class
export class MidnightProvider implements IProvider<MidnightApi> {
  constructor(
    private readonly conn: ActiveConnection<MidnightApi>,
    readonly address: MidnightAddress
  ) {}

  static init = async (
    conn: ActiveConnection<MidnightApi>
  ): Promise<MidnightProvider> => {
    const hexAddress = await MidnightProvider.fetchAddress(conn);
    // const prefix = pickBech32Prefix(hexAddress);
    // const words = bech32.toWords(hexStringToUint8Array(hexAddress));
    // const userAddress = bech32.encode(prefix, words, 200);

    return new MidnightProvider(conn, hexAddress as MidnightAddress);
  };

  getConnection(): ActiveConnection<MidnightApi> {
    return this.conn;
  }
  
  signMessage = async (message: string): Promise<UserSignature> => {
    console.log('NYI LACE: MidnightProvider.signMessage', message);
    return message; // this.conn.api.signMessage(message);
  };

  getAddress(): AddressAndType {
    return {
      type: AddressType.MIDNIGHT,
      address: this.address,
    }
  }

  static fetchAddress = async (conn: ActiveConnection<MidnightApi>): Promise<string> => {
    const state = await conn.api.state();
    // address : "mn_shield-addr_undeployed1k7dst6qphntqmypwa4mhyltk794wx4lta07kherlc9y6clu5swssxqr9xe4z7txy8rscldhec7nmm47ujccf7syky0wz86jwahhkfd3mvq9wu8qx"
    // addressLegacy : "b79b05e801bcd60d902eed77727d76f16ae357ebebfd6be47fc149ac7f9483a1|030065366a2f2cc438e18fb6f9c7a7bdd7dc96309f409623dc23ea4eedef64b63b60"
    // coinPublicKey : "mn_shield-cpk_undeployed1k7dst6qphntqmypwa4mhyltk794wx4lta07kherlc9y6clu5swsspxas0m"
    // coinPublicKeyLegacy : "b79b05e801bcd60d902eed77727d76f16ae357ebebfd6be47fc149ac7f9483a1"
    // encryptionPublicKey : "mn_shield-epk_undeployed1qvqx2dn29ukvgw8p37m0n3a8hhtae93snaqfvg7uy04yam00vjmrkcqtdla9r"
    // encryptionPublicKeyLegacy : "030065366a2f2cc438e18fb6f9c7a7bdd7dc96309f409623dc23ea4eedef64b63b60"
    return state.address;
  };
}
