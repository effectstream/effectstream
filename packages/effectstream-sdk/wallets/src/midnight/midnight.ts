import { AddressType, type MidnightAddress } from "@effectstream/utils";
import type {
  ConnectedAPI,
  InitialAPI,
  Signature,
} from "@midnight-ntwrk/dapp-connector-api";
import semver from "semver";
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

export type MidnightApi = ConnectedAPI;

const COMPATIBLE_CONNECTOR_API_VERSION = ">=1.0.0";
const DEFAULT_NETWORK_ID = "undeployed";

// TODO Implement this class
export class MidnightConnector
  implements IConnector<MidnightApi>, IInjectedConnector<MidnightApi> {
  private provider: MidnightProvider | undefined;
  private static INSTANCE: undefined | MidnightConnector = undefined;
  private static networkId = DEFAULT_NETWORK_ID;
  
  static getWalletOptions(): ConnectionOption<MidnightApi>[] {
    const midnightApi: Record<string, InitialAPI> = (getWindow() as any)
      ?.midnight ?? {};
    console.log("MidnightConnector.getWalletOptions: window.midnight content:", midnightApi);
    const options = Object.entries(midnightApi).reduce((options, [key, api]) => {
      console.log(`MidnightConnector.getWalletOptions: Checking wallet "${key}"`, api);
      if (!isInitialApi(api)) {
        console.log(`MidnightConnector.getWalletOptions: Wallet "${key}" is NOT a valid InitialAPI (missing connect or apiVersion)`);
        return options;
      }
      if (!isCompatibleApiVersion(api.apiVersion)) {
        console.log(`MidnightConnector.getWalletOptions: Wallet "${key}" has incompatible version ${api.apiVersion} (required: ${COMPATIBLE_CONNECTOR_API_VERSION})`);
        return options;
      }
      const name = api.rdns?.trim() || key;
      const displayName = api.name?.trim() || name;
      console.log(`MidnightConnector.getWalletOptions: Wallet "${key}" is COMPATIBLE. Name: ${name}, DisplayName: ${displayName}`);
      options.push({
        metadata: {
          name,
          displayName,
          icon: api.icon,
        },
        api: () => connectWithNetwork(api, MidnightConnector.networkId),
      });
      return options;
    }, [] as ConnectionOption<MidnightApi>[]);
    console.log(`MidnightConnector.getWalletOptions: Found ${options.length} compatible wallets`);
    return options;
  }
  
  static instance(): MidnightConnector {
    if (MidnightConnector.INSTANCE == null) {
      const newInstance = new MidnightConnector();
      MidnightConnector.INSTANCE = newInstance;
    }
    return MidnightConnector.INSTANCE;
  }

  setNetworkId = (networkId: string): void => {
    MidnightConnector.networkId = networkId || DEFAULT_NETWORK_ID;
  };

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
  
  signMessage = async (
    message: string,
    keyType: "unshielded" = "unshielded"
  ): Promise<UserSignature> => {
    const signature = (await this.conn.api.signData(message, {
      encoding: "text",
      keyType,
    })) as Signature;
    // Format: "signature|verifyingKey". Midnight unshielded signatures are
    // not self-recovering, so `@effectstream/crypto`'s verifier needs the
    // public key alongside the signature (matches the local-seed wallet
    // and mirrors Cardano's "sig+key" convention with a different
    // separator).
    return `${signature.signature}|${signature.verifyingKey}`;
  };

  getAddress(): AddressAndType {
    return {
      type: AddressType.MIDNIGHT,
      address: this.address,
    }
  }

  /**
   * Returns the wallet's UNSHIELDED address — the one that pairs with the
   * unshielded signing key used by `signMessage`. `addressFromKey(vk)` must
   * map to this address for `MidnightCrypto.verifySignature` to accept the
   * signature; the shielded address is derived from independent zswap keys,
   * so verification against it can't be done from a `signData` result.
   *
   * The shielded address is still reachable via
   * `getConnection().api.getShieldedAddresses()` for callers that need it.
   */
  static fetchAddress = async (conn: ActiveConnection<MidnightApi>): Promise<string> => {
    const res = await conn.api.getUnshieldedAddress();
    if (!res?.unshieldedAddress) {
      throw new Error("Midnight wallet did not return an unshielded address");
    }
    return res.unshieldedAddress;
  };
}

const isInitialApi = (api: InitialAPI | undefined): api is InitialAPI => {
  return (
    !!api &&
    typeof api.connect === "function" &&
    typeof api.apiVersion === "string"
  );
};

const isCompatibleApiVersion = (apiVersion: string): boolean => {
  return semver.satisfies(
    apiVersion,
    COMPATIBLE_CONNECTOR_API_VERSION,
    { includePrerelease: true }
  );
};

const connectWithNetwork = async (
  api: InitialAPI,
  networkId: string
): Promise<ConnectedAPI> => {
  const connect = api.connect.bind(api);
  return await connect(networkId);
};
