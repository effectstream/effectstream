import { Buffer } from "node:buffer";
import { AddressType, type MidnightAddress } from "@effectstream/utils";
import type {
  ActiveConnection,
  AddressAndType,
  IProvider,
  UserSignature,
} from "../IProvider.ts";
import type { MidnightApi } from "./midnight.ts";

export type MidnightLocalConnectArgs = {
  /** 64-character hex seed. Generated when omitted. */
  seed?: string;
  /** Midnight network id — sets the bech32 prefix on the unshielded address. */
  networkId: string;
};

/**
 * Shape exposed on `getConnection().api`. A minimal subset of `ConnectedAPI`
 * that the rest of Effectstream's Midnight code consumes:
 *   - `signData` mirrors the dapp-connector-api shape.
 *   - `getShieldedAddresses` is stubbed (shielded sync is out of scope for the
 *     lite/seed-only path — callers that need shielded/dust addresses should
 *     build the full WalletFacade via `@effectstream/midnight-contracts`).
 */
export type MidnightLocalApi = {
  signData: (
    data: string,
    options: { encoding: "text" | "hex"; keyType: "unshielded" },
  ) => Promise<{ data: string; signature: string; verifyingKey: string }>;
  getShieldedAddresses: () => Promise<{ shieldedAddress: string }>;
  /** The derived seed, exposed so tests can persist/reuse the wallet. */
  seed: string;
  /** Public verifying key for the unshielded signing role (hex). */
  verifyingKey: string;
  /** Bech32-encoded unshielded address. */
  unshieldedAddress: string;
};

export class MidnightLocalConnector {
  private provider: MidnightLocalProvider | undefined;
  private static INSTANCE: undefined | MidnightLocalConnector = undefined;

  static instance(): MidnightLocalConnector {
    if (MidnightLocalConnector.INSTANCE == null) {
      MidnightLocalConnector.INSTANCE = new MidnightLocalConnector();
    }
    return MidnightLocalConnector.INSTANCE;
  }

  /**
   * Build a Midnight wallet identity from a hex seed.
   *
   * This is the "lite" / signing-only path: it derives the unshielded
   * keystore from the seed and exposes a CIP-30-shaped `signData` backed by
   * `unshieldedKeystore.signData(...)`. It does NOT bring up the shielded /
   * dust wallets — that requires a live indexer + proof server and lives in
   * `@effectstream/midnight-contracts`'s `buildWalletFacade`.
   */
  connectFromSeed = async (
    args: MidnightLocalConnectArgs,
  ): Promise<MidnightLocalProvider> => {
    const hdMod = await import("@midnight-ntwrk/wallet-sdk-hd").catch(() => {
      throw new Error(
        "@midnight-ntwrk/wallet-sdk-hd is required for WalletMode.MidnightLocal.",
      );
    });
    const keystoreMod = await import(
      "@midnight-ntwrk/wallet-sdk-unshielded-wallet"
    ).catch(() => {
      throw new Error(
        "@midnight-ntwrk/wallet-sdk-unshielded-wallet is required for WalletMode.MidnightLocal.",
      );
    });

    const seed = args.seed ?? generateRandomHexSeed(32);
    const unshieldedSeed = deriveUnshieldedSeed(
      hdMod,
      seed,
      hdMod.Roles.NightExternal,
    );
    const unshieldedKeystore = keystoreMod.createKeystore(
      unshieldedSeed,
      args.networkId as never,
    );

    const unshieldedAddress = unshieldedKeystore.getBech32Address().asString();
    const verifyingKey = String(unshieldedKeystore.getPublicKey());

    const api: MidnightLocalApi = {
      signData: async (data, options) => {
        const bytes =
          options.encoding === "hex"
            ? Buffer.from(data, "hex")
            : Buffer.from(data, "utf-8");
        const signature = unshieldedKeystore.signData(bytes);
        return {
          data,
          signature: String(signature),
          verifyingKey,
        };
      },
      getShieldedAddresses: async () => {
        throw new Error(
          "MidnightLocal lite mode does not expose a shielded address. Build a WalletFacade via @effectstream/midnight-contracts for shielded/dust support.",
        );
      },
      seed,
      verifyingKey,
      unshieldedAddress,
    };

    const conn: ActiveConnection<MidnightApi> = {
      api: api as unknown as MidnightApi,
      metadata: {
        name: "midnight-local",
        displayName: "Midnight (local seed)",
      },
    };

    this.provider = new MidnightLocalProvider(
      conn,
      unshieldedAddress as MidnightAddress,
      unshieldedKeystore,
    );
    return this.provider;
  };

  getProvider = (): undefined | MidnightLocalProvider => {
    return this.provider;
  };

  getOrThrowProvider = (): MidnightLocalProvider => {
    if (this.provider == null) {
      throw new Error("MidnightLocalConnector not initialized yet");
    }
    return this.provider;
  };

  isConnected = (): boolean => {
    return this.provider != null;
  };
}

export class MidnightLocalProvider implements IProvider<MidnightApi> {
  constructor(
    private readonly conn: ActiveConnection<MidnightApi>,
    readonly address: MidnightAddress,
    private readonly unshieldedKeystore: unknown,
  ) {}

  getConnection = (): ActiveConnection<MidnightApi> => {
    return this.conn;
  };

  getAddress = (): AddressAndType => {
    return {
      type: AddressType.MIDNIGHT,
      address: this.address,
    };
  };

  signMessage = async (message: string): Promise<UserSignature> => {
    const signed = await (this.conn.api as unknown as MidnightLocalApi).signData(
      message,
      { encoding: "text", keyType: "unshielded" },
    );
    // Format: "signature|verifyingKey". Midnight signatures are not
    // self-recovering (unlike EVM ECDSA), so the verifier needs the public
    // key to call ledger-v8.verifySignature. Mirrors Cardano's "sig+key"
    // convention, just with `|` as the separator to keep the formats distinct.
    return `${signed.signature}|${signed.verifyingKey}`;
  };

  /** Expose the keystore for callers that need the raw signing primitive. */
  getUnshieldedKeystore = (): unknown => this.unshieldedKeystore;
}

function deriveUnshieldedSeed(
  hdMod: typeof import("@midnight-ntwrk/wallet-sdk-hd"),
  seedHex: string,
  role: import("@midnight-ntwrk/wallet-sdk-hd").Role,
): Uint8Array {
  const seedBuffer = Buffer.from(seedHex, "hex");
  const hdResult = hdMod.HDWallet.fromSeed(seedBuffer);
  if (hdResult.type !== "seedOk") {
    throw new Error(`HDWallet.fromSeed failed: ${hdResult.type}`);
  }
  const derivation = hdResult.hdWallet
    .selectAccount(0)
    .selectRole(role)
    .deriveKeyAt(0);
  if (derivation.type !== "keyDerived") {
    throw new Error(`HDWallet.deriveKeyAt failed: ${derivation.type}`);
  }
  return Buffer.from(derivation.key);
}

function generateRandomHexSeed(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
