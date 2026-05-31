import { Buffer } from "node:buffer";
import { AddressType, type MidnightAddress } from "@effectstream/utils";
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
  getShieldedAddresses: () => Promise<{ shieldedAddress: string }>;
  /** The derived seed, exposed so tests can persist/reuse the wallet. */
  seed: string;
  /** Public verifying key for the unshielded signing role (hex). */
  verifyingKey: string;
  /** Bech32-encoded unshielded address. */
  unshieldedAddress: string;
  /**
   * Full Midnight `WalletFacade`. Populated only when `networkUrls` was passed
   * to `connectFromSeed`. Cast to
   * `import("@midnight-ntwrk/wallet-sdk-facade").WalletFacade` for typed
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
    // Import the narrow `/wallet-info` subpath rather than the package barrel.
    // The barrel (`@effectstream/midnight-contracts`) re-exports `deploy.ts`,
    // which imports `node:fs/promises` — a specifier the browser polyfill
    // (`node-stdlib-browser`) can't resolve, breaking any frontend bundle that
    // includes `@effectstream/wallets`. `buildWalletFacade` and
    // `getInitialShieldedState` (the only members we use) live in
    // `get-wallet-info.ts`, which is node-only-fs-free.
    const contractsMod = await import(
      "@effectstream/midnight-contracts/wallet-info"
    ).catch(() => {
      throw new Error(
        "@effectstream/midnight-contracts is required when `networkUrls` is passed to MidnightLocal.connectFromSeed. Install it as a peer dependency.",
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
      unshieldedSeed,
      args.networkId as never,
    );
    const verifyingKey = String(unshieldedKeystore.getPublicKey());

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
      getShieldedAddresses: async () => ({ shieldedAddress }),
      seed,
      verifyingKey,
      unshieldedAddress: walletResult.unshieldedAddress,
      walletFacade: walletResult.wallet,
      dustAddress: walletResult.dustAddress,
      shieldedAddress,
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
    // key to call ledger-v8.verifySignature. Mirrors Cardano's "sig+key"
    // convention, just with `|` as the separator to keep the formats distinct.
    return `${signed.signature}|${signed.verifyingKey}`;
  };

  /** Expose the keystore for callers that need the raw signing primitive. */
  getUnshieldedKeystore = (): unknown => this.unshieldedKeystore;
}

async function loadKeystoreDeps(): Promise<{
  hdMod: typeof import("@midnight-ntwrk/wallet-sdk-hd");
  keystoreMod: typeof import("@midnight-ntwrk/wallet-sdk-unshielded-wallet");
}> {
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
  return { hdMod, keystoreMod };
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
