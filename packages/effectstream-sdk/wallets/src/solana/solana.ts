import { AddressType } from "@effectstream/utils";
import {
  type IConnector,
  type IInjectedConnector,
  type ConnectionOption,
  optionToActive,
  type ActiveConnection,
  type IProvider,
  type AddressAndType,
  type UserSignature,
} from "../IProvider.ts";
import { getWindow } from "../windows.ts";

/**
 * Solana wallet API interface.
 * Matches the Solana wallet standard (Phantom, Backpack, Solflare, etc.)
 */
export interface SolanaWalletApi {
  publicKey: { toBase58(): string };
  signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }>;
  signTransaction?(tx: unknown): Promise<unknown>;
  sendTransaction?(
    tx: unknown,
    connection: unknown,
  ): Promise<string>;
  isPhantom?: boolean;
  isConnected?: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export type SolanaApi = SolanaWalletApi;

/**
 * Solana wallet connector.
 * Supports Phantom, Backpack, Solflare, and any wallet that implements
 * the Solana wallet standard (window.solana or window.phantom).
 */
export class SolanaConnector
  implements IConnector<SolanaApi>, IInjectedConnector<SolanaApi>
{
  private provider: SolanaProvider | undefined;
  private static INSTANCE: undefined | SolanaConnector = undefined;

  static getWalletOptions(): ConnectionOption<SolanaApi>[] {
    const win = getWindow() as any;
    const wallets: ConnectionOption<SolanaApi>[] = [];

    // Check for Phantom
    if (win?.phantom?.solana) {
      wallets.push({
        metadata: {
          name: "phantom",
          displayName: "Phantom",
          icon: win.phantom?.solana?.icon,
        },
        api: async () => win.phantom.solana as SolanaWalletApi,
      });
    }

    // Check for Backpack
    if (win?.backpack?.solana) {
      wallets.push({
        metadata: {
          name: "backpack",
          displayName: "Backpack",
        },
        api: async () => win.backpack.solana as SolanaWalletApi,
      });
    }

    // Check for Solflare
    if (win?.solflare?.isSolflare) {
      wallets.push({
        metadata: {
          name: "solflare",
          displayName: "Solflare",
        },
        api: async () => win.solflare as SolanaWalletApi,
      });
    }

    // Generic Solana wallet standard
    if (
      win?.solana &&
      !win.solana.isPhantom &&
      wallets.length === 0
    ) {
      wallets.push({
        metadata: {
          name: "solana",
          displayName: "Solana Wallet",
        },
        api: async () => win.solana as SolanaWalletApi,
      });
    }

    return wallets;
  }

  static instance(): SolanaConnector {
    if (SolanaConnector.INSTANCE == null) {
      const newInstance = new SolanaConnector();
      SolanaConnector.INSTANCE = newInstance;
    }
    return SolanaConnector.INSTANCE;
  }

  connectSimple = async (): Promise<SolanaProvider> => {
    const options = SolanaConnector.getWalletOptions();
    if (options.length === 0) {
      throw new Error("No Solana wallet found. Please install Phantom or Backpack.");
    }
    return this.connectNamed(options[0].metadata.name);
  };

  connectNamed = async (name: string): Promise<SolanaProvider> => {
    const options = SolanaConnector.getWalletOptions();
    const option = options.find((o) => o.metadata.name === name);
    if (!option) {
      throw new Error(`Wallet "${name}" not found`);
    }
    const active = await optionToActive(option);
    return this.connectExternal(active);
  };

  connectExternal = async (
    conn: ActiveConnection<SolanaApi>,
  ): Promise<SolanaProvider> => {
    const api = conn.api;

    if (api.isConnected === false) {
      await api.connect();
    }

    const address = api.publicKey.toBase58();
    this.provider = new SolanaProvider(conn, address);
    return this.provider;
  };

  getProvider(): undefined | SolanaProvider {
    return this.provider;
  }

  getOrThrowProvider(): SolanaProvider {
    if (!this.provider) {
      throw new Error("Solana wallet not connected");
    }
    return this.provider;
  }

  isConnected(): boolean {
    return this.provider != null;
  }
}

/**
 * Solana wallet provider implementing IProvider.
 */
export class SolanaProvider implements IProvider<SolanaApi> {
  constructor(
    private readonly connection: ActiveConnection<SolanaApi>,
    private readonly address: string,
  ) {}

  getConnection(): ActiveConnection<SolanaApi> {
    return this.connection;
  }

  async signMessage(message: string): Promise<UserSignature> {
    const encoded = new TextEncoder().encode(message);
    const { signature } = await this.connection.api.signMessage(encoded);
    // Return base64-encoded signature
    return Buffer.from(signature).toString("base64");
  }

  getAddress(): AddressAndType {
    return {
      type: AddressType.SOLANA,
      address: this.address,
    };
  }
}
