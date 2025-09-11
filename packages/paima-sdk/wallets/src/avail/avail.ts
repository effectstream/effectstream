import { Buffer } from "node:buffer";
import { utf8ToHex } from 'web3-utils';
import type { ApiPromise, Keyring } from "avail-js-sdk";
import { AddressType } from "@paima/utils";
import type { IProvider, ActiveConnection, AddressAndType, UserSignature } from "../IProvider.ts";
import type { PolkadotAddress } from "../polkadot/polkadot.ts";
const { u8aToHex } = await import('@polkadot/util');

export type AvailJsApi = { rpc: ApiPromise; keyring: Keyring };

export class AvailConnector {
  private provider: AvailJsProvider | undefined;
  private static INSTANCE: undefined | AvailConnector = undefined;

  static instance(): AvailConnector {
    if (AvailConnector.INSTANCE == null) {
      const newInstance = new AvailConnector();
      AvailConnector.INSTANCE = newInstance;
    }
    return AvailConnector.INSTANCE;
  }

  connectExternal = async (conn: AvailJsApi): Promise<AvailJsProvider> => {
    this.provider = await AvailJsProvider.init(conn);
    return this.provider;
  };

  getProvider = (): undefined | AvailJsProvider => {
    return this.provider;
  };
  getOrThrowProvider = (): AvailJsProvider => {
    if (this.provider == null) {
      throw new Error(`AvailJsConnector not initialized yet`);
    }
    return this.provider;
  };
  isConnected = (): boolean => {
    return this.provider != null;
  };
}

export class AvailJsProvider implements IProvider<AvailJsApi> {
  constructor(
    private readonly conn: ActiveConnection<AvailJsApi>,
    readonly address: PolkadotAddress
  ) {}

  static init = async (api: AvailJsApi): Promise<AvailJsProvider> => {
    const pair = api.keyring.getPairs()[0];

    const conn = {
      api: api,
      metadata: {
        name: 'AvailJs',
        displayName: 'AvailJs',
      },
    };
    return new AvailJsProvider(conn, pair.address);
  };

  getConnection = (): ActiveConnection<AvailJsApi> => {
    return this.conn;
  };
  getAddress = (): AddressAndType => {
    return {
      type: AddressType.AVAIL,
      address: this.address,
    };
  };
  signMessage = async (message: string): Promise<UserSignature> => {
    const hexMessage = utf8ToHex(message);
    const buffer = Buffer.from(hexMessage.slice(2), 'hex');
    const signature = this.conn.api.keyring.getPairs()[0].sign(buffer);
    return u8aToHex(signature);
  };
}
