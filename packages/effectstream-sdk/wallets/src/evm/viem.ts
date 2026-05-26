import {
  createWalletClient,
  http,
  type Chain,
  type Hex,
  type PrivateKeyAccount,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AddressType } from "@effectstream/utils";
import type {
  ActiveConnection,
  AddressAndType,
  IProvider,
  UserSignature,
} from "../IProvider.ts";
import type { EvmAddress } from "./types.ts";

export type ViemApi = WalletClient;

export type ViemConnectArgs = {
  privateKey: Hex;
  rpcUrl: string;
  chain?: Chain;
};

export class ViemConnector {
  private provider: ViemEvmProvider | undefined;
  private static INSTANCE: undefined | ViemConnector = undefined;

  static instance(): ViemConnector {
    if (ViemConnector.INSTANCE == null) {
      ViemConnector.INSTANCE = new ViemConnector();
    }
    return ViemConnector.INSTANCE;
  }

  connectFromPrivateKey = async (
    args: ViemConnectArgs,
  ): Promise<ViemEvmProvider> => {
    const account = privateKeyToAccount(args.privateKey);
    const client = createWalletClient({
      account,
      chain: args.chain,
      transport: http(args.rpcUrl),
    });
    this.provider = await ViemEvmProvider.init(client, account);
    return this.provider;
  };

  connectExternal = async (
    conn: ActiveConnection<ViemApi>,
  ): Promise<ViemEvmProvider> => {
    const account = conn.api.account;
    if (account == null) {
      throw new Error(
        "ViemConnector.connectExternal: WalletClient.account is null. Build the client with createWalletClient({ account, ... }).",
      );
    }
    this.provider = await ViemEvmProvider.init(conn.api, account, conn.metadata);
    return this.provider;
  };

  getProvider = (): undefined | ViemEvmProvider => {
    return this.provider;
  };

  getOrThrowProvider = (): ViemEvmProvider => {
    if (this.provider == null) {
      throw new Error("ViemConnector not initialized yet");
    }
    return this.provider;
  };

  isConnected = (): boolean => {
    return this.provider != null;
  };
}

export class ViemEvmProvider implements IProvider<ViemApi> {
  constructor(
    private readonly conn: ActiveConnection<ViemApi>,
    private readonly account: PrivateKeyAccount | WalletClient["account"],
    readonly address: EvmAddress,
  ) {}

  static init = async (
    client: ViemApi,
    account: NonNullable<WalletClient["account"]>,
    metadata?: { name: string; displayName: string },
  ): Promise<ViemEvmProvider> => {
    const conn: ActiveConnection<ViemApi> = {
      api: client,
      metadata: metadata ?? {
        name: "viem-local",
        displayName: "Viem (local)",
      },
    };
    return new ViemEvmProvider(conn, account, account.address as EvmAddress);
  };

  getConnection = (): ActiveConnection<ViemApi> => {
    return this.conn;
  };

  getAddress = (): AddressAndType => {
    return {
      type: AddressType.EVM,
      address: this.address.toLowerCase(),
    };
  };

  signMessage = async (message: string): Promise<UserSignature> => {
    if (this.account == null) {
      throw new Error("ViemEvmProvider.signMessage: account is missing");
    }
    return await this.conn.api.signMessage({
      account: this.account,
      message,
    });
  };
}
