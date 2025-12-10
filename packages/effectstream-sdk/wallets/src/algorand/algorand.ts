import { PeraWalletConnect } from "@perawallet/connect";
import { AddressType, uint8ArrayToHexString } from "@effectstream/utils";
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
import { CryptoManager } from "@effectstream/crypto";

export type AlgorandApi = PeraWalletConnect;
export type AlgorandAddress = string;

export class AlgorandConnector
  implements IConnector<AlgorandApi>, IInjectedConnector<AlgorandApi>
{
  private provider: AlgorandProvider | undefined;
  private static INSTANCE: undefined | AlgorandConnector = undefined;

  static getWalletOptions(): ConnectionOption<AlgorandApi>[] {
    // Algorand has no standard for wallet discovery
    // The closest that exists is ARC11 (https://arc.algorand.foundation/ARCs/arc-0011)
    // but it doesn't give any information about which wallet is injected
    // and, similar to window.ethereum, has wallets overriding each other
    // and Pera wallet doesn't even use this standard
    // instead, the best we can do is check if Pera injected its UI component in the window
    if (
      (getWindow() as any)?.customElements.get("pera-wallet-connect-modal") ==
      null
    ) {
      return [];
    }
    return [
      {
        metadata: {
          name: "pera",
          displayName: "Pera Wallet",
        },
        api: async (): Promise<AlgorandApi> => {
          // const { PeraWalletConnect } = await import("@perawallet/connect");
          const peraWallet = new PeraWalletConnect();
          return peraWallet;
        },
      },
    ];
  }

  static instance(): AlgorandConnector {
    if (AlgorandConnector.INSTANCE == null) {
      const newInstance = new AlgorandConnector();
      AlgorandConnector.INSTANCE = newInstance;
    }
    return AlgorandConnector.INSTANCE;
  }
  connectSimple = async (): Promise<AlgorandProvider> => {
    if (this.provider != null) {
      return this.provider;
    }
    const options = AlgorandConnector.getWalletOptions();
    if (options.length === 0) {
      throw new Error(`No Algorand wallet found`);
    }
    return await this.connectExternal(await optionToActive(options[0]));
  };
  connectExternal = async (
    conn: ActiveConnection<AlgorandApi>
  ): Promise<AlgorandProvider> => {
    if (this.provider?.getConnection().metadata?.name === conn.metadata.name) {
      return this.provider;
    }
    this.provider = await AlgorandProvider.init(conn);
    return this.provider;
  };
  connectNamed = async (name: string): Promise<AlgorandProvider> => {
    if (this.provider?.getConnection().metadata?.name === name) {
      return this.provider;
    }
    const provider = AlgorandConnector.getWalletOptions().find(
      (entry) => entry.metadata.name === name
    );
    if (provider == null) {
      throw new Error(`AlgorandProvider: unsupported connection type ${name}`);
    }
    return await this.connectExternal(await optionToActive(provider));
  };
  getProvider = (): undefined | AlgorandProvider => {
    return this.provider;
  };
  getOrThrowProvider = (): AlgorandProvider => {
    if (this.provider == null) {
      throw new Error(`AlgorandConnector provider isn't initialized yet`);
    }
    return this.provider;
  };
  isConnected = (): boolean => {
    return this.provider != null;
  };
}

export class AlgorandProvider implements IProvider<AlgorandApi> {
  constructor(
    private readonly conn: ActiveConnection<AlgorandApi>,
    readonly address: AlgorandAddress
  ) {}
  static init = async (
    conn: ActiveConnection<AlgorandApi>
  ): Promise<AlgorandProvider> => {
    let newAccounts: string[] = [];
    // conn.api.isConnected starts as false, even if connected
    // if connected and connected() is called, then an error is thrown
    try { 
      newAccounts = await conn.api.reconnectSession();
      if ( newAccounts.length < 1) {
        throw new Error("[peraLogin] no addresses returned!");
      }
    } catch (error) {
      newAccounts = await conn.api.connect();
    }

    if (newAccounts.length < 1) {
      throw new Error("[peraLogin] no addresses returned!");
    }
    return new AlgorandProvider(conn, newAccounts[0]);
  };
  getConnection = (): ActiveConnection<AlgorandApi> => {
    return this.conn;
  };
  getAddress = (): AddressAndType => {
    return {
      type: AddressType.ALGORAND,
      address: this.address,
    };
  };
  signMessage = async (message: string): Promise<UserSignature> => {
    const txn = await CryptoManager.Algorand().buildAlgorandTransaction(
      this.getAddress().address,
      message
    );
    const signerTx = {
      txn,
      signers: [this.getAddress().address],
    };

    const signedTxs = await this.conn.api.signTransaction(
      [[signerTx]],
      this.getAddress().address
    );
    if (signedTxs.length !== 1) {
      throw new Error(
        `[signMessageAlgorand] invalid number of signatures returned: ${signedTxs.length}`
      );
    }
    const signedTx = await CryptoManager.Algorand().decodeSignedTransaction(
      signedTxs[0]
    );
    const signature = signedTx.sig;
    if (!signature) {
      throw new Error(`[signMessageAlgorand] signature missing in signed Tx`);
    }
    const hexSignature = uint8ArrayToHexString(signature);
    return hexSignature;
  };
}
