import { AddressType } from "@effectstream/utils";
import { utf8ToHex } from "web3-utils";
import type {
  ActiveConnection,
  AddressAndType,
  IProvider,
  UserSignature,
} from "../IProvider.ts";
import type { CardanoApi, CardanoAddress } from "./cardano.ts";

export type CardanoLocalNetwork = "Mainnet" | "Preprod" | "Preview" | "Custom";

export type CardanoLocalConnectArgs = {
  /** BIP-39 mnemonic. Generated via `@lucid-evolution/utils#generateSeedPhrase` when omitted. */
  seedPhrase?: string;
  /** Cardano network — must match the chain address the signature is verified against. */
  network: CardanoLocalNetwork;
  /**
   * Optional Lucid `Provider`. Pass when the caller wants Lucid to fetch UTxOs
   * or submit transactions through this wallet. Pure signing does not require it.
   */
  provider?: unknown;
};

/**
 * `getConnection().api` shape. Mirrors the CIP-30 subset that the rest of
 * Effectstream's Cardano code consumes from a real injected wallet (signData,
 * getUsedAddresses) so existing consumers work unchanged.
 */
export type CardanoLocalApi = {
  /** CIP-30 signData. Returns COSE_Sign1 (signature) + COSE_Key (key) as hex. */
  signData: (
    address: string,
    payloadHex: string,
  ) => Promise<{ signature: string; key: string }>;
  /** Hex-encoded address list, matching CIP-30 `getUsedAddresses`. */
  getUsedAddresses: () => Promise<string[]>;
  /** Underlying Lucid handle for callers that need tx-building. */
  lucid: unknown;
  /** Generated/passed seed phrase. Exposed so tests can persist/reuse the wallet. */
  seedPhrase: string;
};

export class CardanoLocalConnector {
  private provider: CardanoLocalProvider | undefined;
  private static INSTANCE: undefined | CardanoLocalConnector = undefined;

  static instance(): CardanoLocalConnector {
    if (CardanoLocalConnector.INSTANCE == null) {
      CardanoLocalConnector.INSTANCE = new CardanoLocalConnector();
    }
    return CardanoLocalConnector.INSTANCE;
  }

  connectFromSeed = async (
    args: CardanoLocalConnectArgs,
  ): Promise<CardanoLocalProvider> => {
    const lucidMod = await import("@lucid-evolution/lucid").catch(() => {
      throw new Error(
        "@lucid-evolution/lucid is required for WalletMode.CardanoLocal. Install it as a peer dependency.",
      );
    });
    const utilsMod = await import("@lucid-evolution/utils").catch(() => {
      throw new Error(
        "@lucid-evolution/utils is required for WalletMode.CardanoLocal. Install it as a peer dependency.",
      );
    });

    const seedPhrase = args.seedPhrase ?? utilsMod.generateSeedPhrase();
    // Lucid's wallet().address() requires a Provider to be set even for pure
    // signing. When the caller doesn't supply one, fall back to an in-memory
    // Emulator so signing-only flows (e2e tests, wallet-connect dry runs) work
    // without standing up Blockfrost / YACI.
    let provider = args.provider;
    if (provider == null) {
      const providerMod = await import("@lucid-evolution/provider").catch(() => {
        throw new Error(
          "@lucid-evolution/provider is required when no provider is supplied to CardanoLocal.",
        );
      });
      provider = new providerMod.Emulator([]);
    }
    const lucid = await lucidMod.Lucid(provider as never, args.network);
    lucid.selectWallet.fromSeed(seedPhrase);

    const bech32Address = await lucid.wallet().address();
    const hexAddress = await addressToHex(lucid, bech32Address);

    const api: CardanoLocalApi = {
      signData: async (address, payloadHex) => {
        return await lucid.wallet().signMessage(address, payloadHex);
      },
      getUsedAddresses: async () => [hexAddress],
      lucid,
      seedPhrase,
    };

    const conn: ActiveConnection<CardanoApi> = {
      api,
      metadata: {
        name: "cardano-local",
        displayName: "Cardano (local seed)",
      },
    };

    this.provider = new CardanoLocalProvider(conn, {
      bech32: bech32Address,
      hex: hexAddress,
    });
    return this.provider;
  };

  getProvider = (): undefined | CardanoLocalProvider => {
    return this.provider;
  };

  getOrThrowProvider = (): CardanoLocalProvider => {
    if (this.provider == null) {
      throw new Error("CardanoLocalConnector not initialized yet");
    }
    return this.provider;
  };

  isConnected = (): boolean => {
    return this.provider != null;
  };
}

export class CardanoLocalProvider implements IProvider<CardanoApi> {
  constructor(
    private readonly conn: ActiveConnection<CardanoApi>,
    readonly address: CardanoAddress,
  ) {}

  getConnection = (): ActiveConnection<CardanoApi> => {
    return this.conn;
  };

  getAddress = (): AddressAndType => {
    return {
      type: AddressType.CARDANO,
      address: this.address.bech32,
    };
  };

  signMessage = async (message: string): Promise<UserSignature> => {
    const hexMessage = utf8ToHex(message).slice(2);
    const { signature, key } = await (
      this.conn.api as CardanoLocalApi
    ).signData(this.address.bech32, hexMessage);
    return `${signature}+${key}`;
  };
}

async function addressToHex(lucid: any, bech32Address: string): Promise<string> {
  const utilsMod = await import("@lucid-evolution/utils");
  const details = utilsMod.getAddressDetails(bech32Address);
  return details.address.hex;
}
