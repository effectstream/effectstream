import { Buffer } from "node:buffer";
import { AddressType, type MidnightAddress } from "@effectstream/utils/types";
import type {
  ActiveConnection,
  AddressAndType,
  IProvider,
  UserSignature,
} from "../IProvider.ts";
import type { MidnightApi } from "./midnight.ts";

/**
 * Network endpoints required to bring up the full WalletFacade. Mirrors
 * `NetworkUrls` from `@effectstream/midnight-contracts` but with every field
 * required (so consumers can't accidentally leave one unset).
 */
export type MidnightLocalNetworkUrls = {
  /** GraphQL indexer HTTP endpoint. */
  indexer: string;
  /** GraphQL indexer WebSocket endpoint. */
  indexerWS: string;
  /** Midnight node RPC endpoint (used as the wallet relay; http→ws is rewritten internally). */
  node: string;
  /** Proof-server HTTP endpoint. */
  proofServer: string;
  /** Optional network id override; defaults to `connectFromSeed`'s `networkId` arg. */
  id?: string;
};

export type MidnightLocalSyncMode = "all" | "dust-only";

export type MidnightLocalConnectArgs = {
  /** 64-character hex seed. Generated when omitted. */
  seed?: string;
  /** Midnight network id — sets the bech32 prefix on the unshielded address. */
  networkId: string;
  /**
   * Network URLs for the full WalletFacade. When supplied, the connector builds
   * a complete wallet (shielded + dust + unshielded) via
   * `@effectstream/midnight-contracts.buildWalletFacade` and exposes it on
   * `getConnection().api.walletFacade`. Required for shielded tx submission,
   * `balanceAndProveTransaction`, dust fee payment, etc.
   *
   * When omitted, the connector returns the signing-only path (unshielded
   * keystore `signData`) — useful for offline signature flows or signature
   * verification dry runs that don't need to stand up indexer + proof-server.
   */
  networkUrls?: MidnightLocalNetworkUrls;
  /** Defaults to "all" when `networkUrls` is supplied. Ignored otherwise. */
  syncMode?: MidnightLocalSyncMode;
};

/**
 * Shape exposed on `getConnection().api`. Mirrors a subset of `ConnectedAPI`
 * that the rest of Effectstream's Midnight code consumes:
 *   - `signData` mirrors the dapp-connector-api shape (works in both modes).
 *   - `getShieldedAddresses` returns the real shielded coin public key when
 *     the full facade is built; throws in signing-only mode.
 *   - `walletFacade` / `dustAddress` / `shieldedAddress` are populated only
 *     when `networkUrls` was supplied at connect time.
 */
export type MidnightLocalApi = {
  signData: (
    data: string,
    options: { encoding: "text" | "hex"; keyType: "unshielded" },
  ) => Promise<{ data: string; signature: string; verifyingKey: string }>;
  /**
   * Shielded keys, in the same SHAPE as the dapp-connector-api's
   * `getShieldedAddresses()` so a consumer can branch on encoding rather than
   * on structure.
   *
   * Encoding still differs by design: these are HEX
   * (`ShieldedAddress.{coin,encryption}PublicKeyString()` return
   * `.data.toString('hex')`), whereas Lace returns bech32m. Do not run these
   * through `parseCoinPublicKeyToHex` / `parseEncPublicKeyToHex`.
   *
   * Both keys matter for contract calls that pay the caller: the coin public
   * key is the output recipient, and the ciphertext is keyed off the
   * encryption public key. Supplying only one means the wallet never finds the
   * coin it was just sent.
   */
  getShieldedAddresses: () => Promise<{
    shieldedAddress: string;
    shieldedCoinPublicKey: string;
    shieldedEncryptionPublicKey: string;
  }>;
  /** The derived seed, exposed so tests can persist/reuse the wallet. */
  seed: string;
  /** Public verifying key for the unshielded signing role (hex). */
  verifyingKey: string;
  /** Bech32-encoded unshielded address. */
  unshieldedAddress: string;
  /**
   * Full Midnight `WalletFacade`. Populated only when `networkUrls` was passed
   * to `connectFromSeed`. Cast to
   * `import("@midnightntwrk/wallet-sdk-facade").WalletFacade` for typed
   * access. Carries `submitTransaction`, `balanceFinalizedTransaction`,
   * `balanceUnboundTransaction`, `balanceUnprovenTransaction`, `signRecipe`,
   * `signUnprovenTransaction`, `state()`, `waitForSyncedState()`, etc.
   */
  walletFacade?: unknown;
  /** Bech32-encoded dust address. Populated only in facade mode. */
  dustAddress?: string;
  /** Hex-encoded shielded coin public key. Populated only in facade mode. */
  shieldedAddress?: string;
  /**
   * Hex-encoded shielded ENCRYPTION public key. Populated only in facade mode.
   * Needed alongside `shieldedAddress` by anything that builds a shielded
   * output for this wallet (e.g. a contract mint) — without it the ciphertext
   * is keyed to the wrong recipient and the coin is never discovered.
   */
  shieldedEncryptionPublicKey?: string;
  /**
   * Escape hatch: the entire `WalletResult` returned by
   * `@effectstream/midnight-contracts.buildWalletFacade`. Exposes the raw
   * secret keys (`zswapSecretKeys`, `dustSecretKey`, `unshieldedKeystore`) that
   * advanced flows (manual tx balancing, custom dust handling) need. Cast to
   * `import("@effectstream/midnight-contracts").WalletResult`.
   * Populated only in facade mode.
   */
  walletResult?: unknown;
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
   * Two modes, picked by whether `args.networkUrls` is supplied:
   *
   *  - **Facade mode** (`networkUrls` set): builds the full Midnight wallet via
   *    `@effectstream/midnight-contracts.buildWalletFacade` — shielded + dust +
   *    unshielded sub-wallets, connected to a live indexer + node + proof
   *    server. The complete `WalletFacade` is exposed on
   *    `getConnection().api.walletFacade`, enabling `submitTransaction`,
   *    `balanceAndProveTransaction`, dust fee payment, etc. Requires
   *    `@effectstream/midnight-contracts` to be installed (optional peer dep).
   *
   *  - **Signing-only mode** (`networkUrls` omitted): derives the unshielded
   *    keystore from the seed and exposes a CIP-30-shaped `signData` backed by
   *    `unshieldedKeystore.signData(...)`. No network IO. Suitable for offline
   *    signature flows and signature-verification dry runs.
   */
  connectFromSeed = async (
    args: MidnightLocalConnectArgs,
  ): Promise<MidnightLocalProvider> => {
    if (args.networkUrls != null) {
      return await this.connectWithFacade(args, args.networkUrls);
    }
    return await this.connectSigningOnly(args);
  };

  private connectSigningOnly = async (
    args: MidnightLocalConnectArgs,
  ): Promise<MidnightLocalProvider> => {
    const { hdMod, keystoreMod } = await loadKeystoreDeps();

    const seed = args.seed ?? generateRandomHexSeed(32);
    const unshieldedSeed = deriveUnshieldedSeed(
      hdMod,
      seed,
      hdMod.Roles.NightExternal,
    );
    const unshieldedKeystore = keystoreMod.createKeystore(
      { kind: "schnorr", secret: unshieldedSeed },
      args.networkId as never,
    );

    const unshieldedAddress = unshieldedKeystore.getBech32Address().asString();
    const verifyingKey = schnorrValue(
      unshieldedKeystore.getPublicKey(),
      "verifying key",
    );

    const api: MidnightLocalApi = {
      signData: async (data, options) => {
        const bytes =
          options.encoding === "hex"
            ? Buffer.from(data, "hex")
            : Buffer.from(data, "utf-8");
        const signature = schnorrValue(
          unshieldedKeystore.signData(bytes),
          "signature",
        );
        return {
          data,
          signature,
          verifyingKey,
        };
      },
      getShieldedAddresses: async () => {
        throw new Error(
          "MidnightLocal signing-only mode does not expose a shielded address. Pass `networkUrls` to connectFromSeed to build the full WalletFacade.",
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

  private connectWithFacade = async (
    args: MidnightLocalConnectArgs,
    networkUrls: MidnightLocalNetworkUrls,
  ): Promise<MidnightLocalProvider> => {
    // Use the `/wallet-info` subpath, not the package barrel: the barrel
    // re-exports `deploy.ts` (`node:fs/promises`), which breaks browser bundles
    // of `@effectstream/wallets`.
    const contractsMod = await import(
      "@effectstream/midnight-contracts/wallet-info"
    ).catch((cause: unknown) => {
      // Preserve the underlying reason. A missing peer dep is only ONE way this
      // import fails — it also rejects when the module resolves but cannot load,
      // e.g. in a browser bundle where `./wallet-info` drags in node:fs. Naming
      // only the peer-dep case sends people to reinstall a package they already
      // have.
      throw new Error(
        "Could not load @effectstream/midnight-contracts/wallet-info, needed when `networkUrls` is passed to MidnightLocal.connectFromSeed. " +
          "Either it is not installed (add it as a peer dependency), or it failed to load in this runtime — see `cause`. " +
          `Underlying error: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    });
    const { hdMod, keystoreMod } = await loadKeystoreDeps();

    const seed = args.seed ?? generateRandomHexSeed(32);
    const unshieldedSeed = deriveUnshieldedSeed(
      hdMod,
      seed,
      hdMod.Roles.NightExternal,
    );
    const unshieldedKeystore = keystoreMod.createKeystore(
      { kind: "schnorr", secret: unshieldedSeed },
      args.networkId as never,
    );
    const verifyingKey = schnorrValue(
      unshieldedKeystore.getPublicKey(),
      "verifying key",
    );

    const fullNetworkUrls = {
      indexer: networkUrls.indexer,
      indexerWS: networkUrls.indexerWS,
      node: networkUrls.node,
      proofServer: networkUrls.proofServer,
      id: networkUrls.id ?? args.networkId,
    };

    const walletResult = await contractsMod.buildWalletFacade(
      fullNetworkUrls,
      seed,
      args.networkId as never,
      args.syncMode ?? "all",
    );

    const initialShielded = await contractsMod.getInitialShieldedState(
      walletResult.wallet.shielded,
    );
    const shieldedAddress = initialShielded.address.coinPublicKeyString();
    // The encryption key sits right next to the coin key on the same address
    // object. It used to be dropped here, which forced every consumer that
    // builds a shielded output for this wallet (a contract mint, say) to
    // re-derive it by calling getInitialShieldedState again from
    // @effectstream/midnight-contracts.
    const shieldedEncryptionPublicKey =
      initialShielded.address.encryptionPublicKeyString();

    const api: MidnightLocalApi = {
      signData: async (data, options) => {
        const bytes =
          options.encoding === "hex"
            ? Buffer.from(data, "hex")
            : Buffer.from(data, "utf-8");
        const signature = schnorrValue(
          unshieldedKeystore.signData(bytes),
          "signature",
        );
        return {
          data,
          signature,
          verifyingKey,
        };
      },
      // `shieldedAddress` is repeated as `shieldedCoinPublicKey` so the shape
      // matches the dapp-connector-api's — locally the "address" IS the coin
      // public key, so they are the same value under both names.
      getShieldedAddresses: async () => ({
        shieldedAddress,
        shieldedCoinPublicKey: shieldedAddress,
        shieldedEncryptionPublicKey,
      }),
      seed,
      verifyingKey,
      unshieldedAddress: walletResult.unshieldedAddress,
      walletFacade: walletResult.wallet,
      dustAddress: walletResult.dustAddress,
      shieldedAddress,
      shieldedEncryptionPublicKey,
      walletResult,
    };

    const conn: ActiveConnection<MidnightApi> = {
      api: api as unknown as MidnightApi,
      metadata: {
        name: "midnight-local",
        displayName: "Midnight (local seed, facade)",
      },
    };

    this.provider = new MidnightLocalProvider(
      conn,
      walletResult.unshieldedAddress as MidnightAddress,
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
    // key to call ledger-v9.verifySignature with tagged Schnorr values. Mirrors Cardano's "sig+key"
    // convention, just with `|` as the separator to keep the formats distinct.
    return `${signed.signature}|${signed.verifyingKey}`;
  };

  /** Expose the keystore for callers that need the raw signing primitive. */
  getUnshieldedKeystore = (): unknown => this.unshieldedKeystore;
}

async function loadKeystoreDeps(): Promise<{
  hdMod: typeof import("@midnightntwrk/wallet-sdk-hd");
  keystoreMod: typeof import("@midnightntwrk/wallet-sdk-unshielded-wallet");
}> {
  const hdMod = await import("@midnightntwrk/wallet-sdk-hd").catch(() => {
    throw new Error(
      "@midnightntwrk/wallet-sdk-hd is required for WalletMode.MidnightLocal.",
    );
  });
  const keystoreMod = await import(
    "@midnightntwrk/wallet-sdk-unshielded-wallet"
  ).catch(() => {
    throw new Error(
      "@midnightntwrk/wallet-sdk-unshielded-wallet is required for WalletMode.MidnightLocal.",
    );
  });
  return { hdMod, keystoreMod };
}

function deriveUnshieldedSeed(
  hdMod: typeof import("@midnightntwrk/wallet-sdk-hd"),
  seedHex: string,
  role: import("@midnightntwrk/wallet-sdk-hd").Role,
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

function schnorrValue(
  value: { tag: "schnorr" | "ecdsa"; value: string },
  label: string,
): string {
  if (value.tag !== "schnorr") {
    throw new Error(`Expected Schnorr ${label}, received ${value.tag}`);
  }
  return value.value;
}
