import type {
  Signer,
  TransactionLike,
  TransactionRequest,
  TransactionResponse,
} from "ethers";

import { Buffer } from "node:buffer";
import { AddressType } from "@paima/utils";
import type {
  ActiveConnection,
  AddressAndType,
  IProvider,
  UserSignature,
} from "../IProvider.ts";
import { DEFAULT_GAS_LIMIT, type EvmAddress } from "./types.ts";
import { utf8ToHex } from "web3-utils";

export type EthersApi = Signer;

export class EthersConnector {
  private provider: EthersEvmProvider | undefined;
  private static INSTANCE: undefined | EthersConnector = undefined;

  static instance(): EthersConnector {
    if (EthersConnector.INSTANCE == null) {
      const newInstance = new EthersConnector();
      EthersConnector.INSTANCE = newInstance;
    }
    return EthersConnector.INSTANCE;
  }

  connectExternal = async (conn: EthersApi): Promise<EthersEvmProvider> => {
    this.provider = await EthersEvmProvider.init(conn);
    return this.provider;
  };
  getProvider = (): undefined | EthersEvmProvider => {
    return this.provider;
  };
  getOrThrowProvider = (): EthersEvmProvider => {
    if (this.provider == null) {
      throw new Error(`EthersConnector not initialized yet`);
    }
    return this.provider;
  };
  isConnected = (): boolean => {
    return this.provider != null;
  };
}
export class EthersEvmProvider implements IProvider<EthersApi> {
  constructor(
    private readonly conn: ActiveConnection<EthersApi>,
    readonly address: EvmAddress,
  ) {}

  static init = async (api: EthersApi): Promise<EthersEvmProvider> => {
    const address = await api.getAddress();
    const conn = {
      api: api,
      metadata: {
        name: "Ethers",
        displayName: "Ethers",
      },
    };
    return new EthersEvmProvider(conn, address);
  };

  getConnection = (): ActiveConnection<EthersApi> => {
    return this.conn;
  };
  getAddress = (): AddressAndType => {
    return {
      type: AddressType.EVM,
      address: this.address.toLowerCase(),
    };
  };
  signMessage = async (message: string): Promise<UserSignature> => {
    const hexMessage = utf8ToHex(message);
    const buffer = Buffer.from(hexMessage.slice(2), "hex");
    const signature = await this.conn.api.signMessage(buffer);
    return signature;
  };
  finalizeTransaction = async (
    tx: TransactionRequest,
  ): Promise<TransactionLike<string>> => {
    return await this.conn.api.populateTransaction({
      gasLimit: DEFAULT_GAS_LIMIT,
      ...tx,
    });
  };
  sendTransaction = async (
    tx: TransactionRequest,
  ): Promise<{
    txHash: string;
    extra: TransactionResponse;
  }> => {
    const finalTx = await this.finalizeTransaction(tx);
    const result = await this.conn.api.sendTransaction(finalTx);
    return {
      txHash: result.hash,
      extra: result,
    };
  };
}
