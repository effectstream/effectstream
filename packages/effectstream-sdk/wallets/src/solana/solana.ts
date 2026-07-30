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
import { getWallets } from "@wallet-standard/app";
import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";

// Wallet Standard feature names. Wallets like MetaMask expose Solana support
// through this registry rather than a legacy injected `window.solana` global.
const STANDARD_CONNECT = "standard:connect";
const STANDARD_DISCONNECT = "standard:disconnect";
const SOLANA_SIGN_MESSAGE = "solana:signMessage";
const SOLANA_SIGN_TRANSACTION = "solana:signTransaction";

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

    // Wallet Standard wallets ( MetaMask Solana, plus Phantom/Solflare/etc.
    // that register this way ). De-duped against the injected entries above by
    // display name so the same wallet isn't listed twice.
    try {
      for (const w of getWallets().get()) {
        if (!isSolanaStandardWallet(w)) continue;
        const name = (w.name ?? "").toLowerCase();
        const already = wallets.some(
          (o) => o.metadata.displayName.toLowerCase() === name,
        );
        if (already) continue;
        wallets.push({
          metadata: {
            name: `standard:${name}`,
            displayName: w.name,
            icon: w.icon,
          },
          api: async () =>
            new WalletStandardSolanaApi(w) as unknown as SolanaWalletApi,
        });
      }
    } catch {
      // Registry unavailable ( e.g. non-browser ) — skip.
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
      throw new Error(
        "No Solana wallet found. Please install a Solana wallet (Phantom, Backpack, or MetaMask).",
      );
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

  /**
   * Sign a partial transaction for the batcher (fee-payer sponsor flow). The
   * transaction's fee payer should already be the batcher's sponsor; the batcher
   * adds that signature and submits.
   *
   * **base64 on both sides**, matching `SolanaBatchPayload.transactions` in
   * `@effectstream/batcher-sdk` — the adapter deserialises with
   * `Transaction.from(Buffer.from(tx, "base64"))`, and both the e2e suite and
   * the solana-starter frontend post base64. This used to be base58 while
   * claiming in its own docblock to match the batcher contract, which it did
   * not: the adapter would have decoded garbage and rejected every transaction.
   */
  async signTransaction(txBase64: string): Promise<string> {
    if (!this.connection.api.signTransaction) {
      throw new Error("Wallet does not support signTransaction");
    }
    // Pass a web3.js `Transaction`, not raw bytes. The injected wallets this
    // connector lists first (Phantom, Backpack, Solflare) take a Transaction
    // object and hand back a signed Transaction — raw bytes make them throw or
    // return garbage. `WalletStandardSolanaApi` below already accepts either and
    // branches on `.serialize`, so the object form works for both paths.
    //
    // Legacy transactions only, matching what SolanaAdapter accepts
    // (`Transaction.from`); a versioned tx throws here and is rejected there.
    const tx = Transaction.from(Buffer.from(txBase64, "base64"));
    const signed = await this.connection.api.signTransaction(tx);
    return serializeSignedTx(signed);
  }
}

/**
 * Normalise whatever a wallet returns from `signTransaction` to base64 — the
 * encoding `SolanaBatchPayload.transactions` expects. Injected wallets return a
 * Transaction-like object; the Wallet Standard bridge returns raw bytes.
 * `requireAllSignatures: false` because the fee payer (the batcher's sponsor)
 * signs later.
 */
function serializeSignedTx(signed: unknown): string {
  if (signed != null && typeof (signed as any).serialize === "function") {
    const bytes: Uint8Array = (signed as any).serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });
    return Buffer.from(bytes).toString("base64");
  }
  if (signed instanceof Uint8Array) {
    return Buffer.from(signed).toString("base64");
  }
  throw new Error(
    "Wallet returned an unrecognised signTransaction result (expected a Transaction or bytes)",
  );
}

/** True if a Wallet Standard wallet can connect + sign Solana messages. */
function isSolanaStandardWallet(wallet: any): boolean {
  const features = wallet?.features ?? {};
  return Boolean(features[STANDARD_CONNECT] && features[SOLANA_SIGN_MESSAGE]);
}

function pickSolanaChain(account: any, wallet: any): string | undefined {
  const chains: string[] = account?.chains ?? wallet?.chains ?? [];
  return chains.find((c) => typeof c === "string" && c.startsWith("solana:"));
}

/**
 * Adapts a Wallet Standard wallet ( e.g. MetaMask's Solana account ) to the
 * `SolanaWalletApi` shape the rest of the connector expects. The Wallet
 * Standard works in serialized bytes, so this bridges to the byte/object
 * contracts the injected ( Phantom-style ) wallets use.
 */
class WalletStandardSolanaApi implements SolanaWalletApi {
  isConnected = false;
  private account: any | undefined;

  constructor(private readonly wallet: any) {}

  get publicKey(): { toBase58(): string } {
    const address = this.account?.address ?? "";
    return { toBase58: () => address };
  }

  async connect(): Promise<void> {
    if (!this.account) {
      const result = await this.wallet.features[STANDARD_CONNECT].connect();
      this.account = (result?.accounts ?? this.wallet.accounts ?? [])[0];
    }
    if (!this.account) {
      throw new Error("Wallet returned no Solana account");
    }
    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    const feature = this.wallet.features[STANDARD_DISCONNECT];
    if (feature?.disconnect) {
      await feature.disconnect();
    }
    this.account = undefined;
    this.isConnected = false;
  }

  async signMessage(message: Uint8Array): Promise<{ signature: Uint8Array }> {
    const feature = this.wallet.features[SOLANA_SIGN_MESSAGE];
    if (!feature) {
      throw new Error("Wallet does not support solana:signMessage");
    }
    const [output] = await feature.signMessage({
      account: this.account,
      message,
    });
    return { signature: output.signature };
  }

  // Two callers: the frontend passes a web3.js Transaction ( has `.serialize` )
  // and calls `.serialize()` on the result; SolanaProvider.signTransaction
  // passes raw bytes and expects bytes back. Handle both.
  async signTransaction(tx: unknown): Promise<unknown> {
    const feature = this.wallet.features[SOLANA_SIGN_TRANSACTION];
    if (!feature) {
      throw new Error(
        "Wallet does not support solana:signTransaction. The batcher flow " +
          "needs a sign-only signature, which this wallet does not provide.",
      );
    }
    const asObject =
      tx != null && typeof (tx as any).serialize === "function";
    const bytes: Uint8Array = asObject
      ? (tx as any).serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      })
      : (tx as Uint8Array);

    const chain = pickSolanaChain(this.account, this.wallet);
    const [output] = await feature.signTransaction({
      account: this.account,
      transaction: Uint8Array.from(bytes),
      ...(chain ? { chain } : {}),
    });
    const signed: Uint8Array = output.signedTransaction;

    // Return a Transaction-like object for the frontend ( only `.serialize` is
    // used ), or raw bytes for the SolanaProvider byte path.
    return asObject ? { serialize: () => signed } : signed;
  }
}
