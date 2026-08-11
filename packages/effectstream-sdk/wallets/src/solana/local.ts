import { AddressType } from "@effectstream/utils/types";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { Buffer } from "node:buffer";
import type {
  ActiveConnection,
  AddressAndType,
  IProvider,
  UserSignature,
} from "../IProvider.ts";

export type SolanaLocalConnectArgs = {
  /** Base58-encoded 32-byte Ed25519 secret (seed). Generated when omitted. */
  secretKey?: string;
};

/**
 * `getConnection().api` shape for a locally-generated Solana keypair wallet.
 * Mirrors the signing subset that real injected Solana wallets expose, so it
 * can stand in for one in tests / headless e2e (cf. CardanoLocal, MidnightLocal).
 */
export type SolanaLocalApi = {
  /**
   * Ed25519 sign over the UTF-8 message bytes, returned base64-encoded —
   * matching `CryptoManager.Solana()` and the injected SolanaProvider.
   */
  signMessage: (message: string) => Promise<UserSignature>;
  /** Base58 public key (the Solana address). */
  address: string;
  /** Base58-encoded secret seed, exposed so tests can persist/reuse the wallet. */
  secretKey: string;
};

/**
 * Locally-generated Solana keypair connector. Signs with an in-process Ed25519
 * key (no browser extension), so it can be used in unit tests and the headless
 * wallets-ui e2e the same way CardanoLocal / MidnightLocal are.
 */
export class SolanaLocalConnector {
  private provider: SolanaLocalProvider | undefined;
  private static INSTANCE: undefined | SolanaLocalConnector = undefined;

  static instance(): SolanaLocalConnector {
    if (SolanaLocalConnector.INSTANCE == null) {
      SolanaLocalConnector.INSTANCE = new SolanaLocalConnector();
    }
    return SolanaLocalConnector.INSTANCE;
  }

  connectFromSeed = async (
    args: SolanaLocalConnectArgs = {},
  ): Promise<SolanaLocalProvider> => {
    const secret = args.secretKey
      ? bs58.decode(args.secretKey)
      : ed25519.utils.randomPrivateKey();
    if (secret.length !== 32) {
      throw new Error("Solana local secret key must be 32 bytes (base58).");
    }
    const address = bs58.encode(ed25519.getPublicKey(secret));

    const api: SolanaLocalApi = {
      address,
      secretKey: bs58.encode(secret),
      signMessage: (message: string) =>
        Promise.resolve(
          Buffer.from(
            ed25519.sign(new TextEncoder().encode(message), secret),
          ).toString("base64"),
        ),
    };

    this.provider = new SolanaLocalProvider(
      {
        metadata: { name: "solana-local", displayName: "Solana (local)" },
        api,
      },
      address,
    );
    return this.provider;
  };

  getProvider(): undefined | SolanaLocalProvider {
    return this.provider;
  }

  getOrThrowProvider(): SolanaLocalProvider {
    if (!this.provider) {
      throw new Error("Solana local wallet not connected");
    }
    return this.provider;
  }

  isConnected(): boolean {
    return this.provider != null;
  }
}

export class SolanaLocalProvider implements IProvider<SolanaLocalApi> {
  constructor(
    private readonly connection: ActiveConnection<SolanaLocalApi>,
    private readonly address: string,
  ) {}

  getConnection(): ActiveConnection<SolanaLocalApi> {
    return this.connection;
  }

  signMessage(message: string): Promise<UserSignature> {
    return this.connection.api.signMessage(message);
  }

  getAddress(): AddressAndType {
    return { type: AddressType.SOLANA, address: this.address };
  }
}
