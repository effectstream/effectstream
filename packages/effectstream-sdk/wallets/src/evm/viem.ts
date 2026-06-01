import {
  createPublicClient,
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

  /**
   * Submit an EIP-1193-shaped transaction request (matching the
   * `EvmInjectedProvider.sendTransaction` shape — all numeric fields are
   * hex strings) by delegating to viem's hoisted `walletClient.sendTransaction`.
   *
   * `account` + `chain` are hoisted on the underlying `WalletClient` at
   * connect time (see `ViemConnector.connectFromPrivateKey`), so we only
   * need to convert the hex-string numeric fields to bigints that viem
   * expects, and pass through `to` / `data` as 0x-strings.
   *
   * Without this method, the high-level `sendTransaction(wallet, …)` helper
   * in `effectstream.ts` rejects with `evmProvider.sendTransaction is not a
   * function` when invoked against a `WalletMode.EvmViem` wallet — blocking
   * any frontend that wants to drive the engine's tx flow via the local-JS
   * wallet (e.g. headless Playwright e2e tests).
   */
  sendTransaction = async (tx: {
    to?: string;
    from: string;
    gas?: string;
    gasPrice?: string;
    data: string;
    value?: string;
    maxPriorityFeePerGas?: string;
    maxFeePerGas?: string;
  }): Promise<{ txHash: string }> => {
    if (this.account == null) {
      throw new Error("ViemEvmProvider.sendTransaction: account is missing");
    }
    const toBigInt = (h?: string): bigint | undefined =>
      h == null ? undefined : BigInt(h);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hash = await (this.conn.api as any).sendTransaction({
      account: this.account,
      to: tx.to as `0x${string}` | undefined,
      data: tx.data as `0x${string}`,
      value: toBigInt(tx.value),
      gas: toBigInt(tx.gas),
      gasPrice: toBigInt(tx.gasPrice),
      maxFeePerGas: toBigInt(tx.maxFeePerGas),
      maxPriorityFeePerGas: toBigInt(tx.maxPriorityFeePerGas),
    });
    if (typeof hash !== "string") {
      throw new Error(
        `[ViemEvmProvider.sendTransaction] expected string tx hash, got ${typeof hash}`,
      );
    }

    // Wait for the receipt + verify status. viem's sendTransaction returns
    // the hash as soon as the tx is broadcast, NOT once it has mined. If we
    // returned the hash without checking the receipt, a reverted tx would
    // look "successful" to the engine's `wait-receipt` confirmation path,
    // and the indexer would never see a matching event because the contract
    // call reverted on chain. Match the EvmInjected / EthersEvmProvider
    // contract: only return when the tx is mined AND its status is 0x1.
    const chain = (this.conn.api as WalletClient).chain;
    const transport = (this.conn.api as WalletClient).transport;
    const publicClient = createPublicClient({
      chain: chain ?? undefined,
      transport: http((transport as { url?: string })?.url),
    });
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
    });
    if (receipt.status !== "success") {
      throw new Error(
        `[ViemEvmProvider.sendTransaction] tx ${hash} reverted on chain (status=${receipt.status})`,
      );
    }
    return { txHash: hash };
  };
}
