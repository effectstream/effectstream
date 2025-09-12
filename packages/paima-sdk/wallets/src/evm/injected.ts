import type { MetaMaskInpageProvider } from "@metamask/providers";
import { AddressType } from "@paima/utils";
import {
  type IInjectedConnector,
  type ConnectionOption,
  optionToActive,
  type ActiveConnection,
  type IProvider,
  type AddressAndType,
  type UserSignature,
} from "../IProvider.ts";
import type { EvmAddress } from "./types.ts";
import { getWindow } from "../windows.ts";
import { utf8ToHex } from "web3-utils";

type EIP1193Provider = MetaMaskInpageProvider;

interface EIP5749ProviderInfo {
  uuid: string;
  name: string;
  icon: `data:image/svg+xml;base64,${string}`;
  description: string;
}
interface EIP5749ProviderWithInfo extends EIP1193Provider {
  info: EIP5749ProviderInfo;
}
interface EIP5749EVMProviders {
  /**
   * The key is RECOMMENDED to be the name of the extension in snake_case. It MUST contain only lowercase letters, numbers, and underscores.
   */
  [index: string]: EIP5749ProviderWithInfo;
}

interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}
interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}
interface EIP6963AnnounceProviderEvent extends CustomEvent {
  type: "eip6963:announceProvider";
  detail: EIP6963ProviderDetail;
}

const eip5953Providers: EIP6963ProviderDetail[] = [];

(getWindow() as any)?.addEventListener(
  "eip6963:announceProvider",
  (event: EIP6963AnnounceProviderEvent) => {
    eip5953Providers.push(event.detail);
  }
);

getWindow()?.dispatchEvent(new Event("eip6963:requestProvider"));

// JSR Error: modifying global types is not allowed
// declare global {
//   interface Window {
//     ethereum?: EIP1193Provider;
//     evmproviders?: EIP5749EVMProviders;
//   }
//   interface WindowEventMap {
//     "eip6963:announceProvider": EIP6963AnnounceProviderEvent;
//   }
// }

/**
 * Type definition from EIP3085 (https://eips.ethereum.org/EIPS/eip-3085)
 * I couldn't find this part of any NPM library for some reason
 */
interface AddEthereumChainParameter {
  chainId: string;
  blockExplorerUrls?: string[];
  chainName?: string;
  iconUrls?: string[];
  nativeCurrency?: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls?: string[];
}

export type EvmApi = EIP1193Provider;

export class EvmInjectedConnector implements IInjectedConnector<EvmApi> {
  private provider: EvmInjectedProvider | undefined;
  private static INSTANCE: undefined | EvmInjectedConnector = undefined;

  /**
   * Wallets may inject themselves using multiple competing standards
   * We have to track all of them (with duplicates) internally
   * To make sure `connectNamed` calls properly find wallets no matter the name used
   */
  static getPossiblyDuplicateWalletOptions(): ConnectionOption<EvmApi>[] {
    const allWallets: ConnectionOption<EvmApi>[] = [];

    const windowObj = getWindow();
    if (windowObj == null) return [];

    // 1) Add EIP6963 and prioritize it for deduplicating
    {
      const eip6963Options = eip5953Providers.map(({ info, provider }) => ({
        metadata: {
          name: info.rdns,
          displayName: info.name,
          icon: info.icon,
        },
        api: (): Promise<MetaMaskInpageProvider> => Promise.resolve(provider),
      }));
      allWallets.push(...eip6963Options);
    }

    // 2) Add EIP5749
    {
      const eip5749Providers: EIP5749EVMProviders = (windowObj as any).evmproviders ?? {};
      const eip5749Options = Object.entries(eip5749Providers).map(
        ([key, provider]) => ({
          metadata: {
            name: key,
            displayName: provider.info.name,
            icon: provider.info.icon,
          },
          api: (): Promise<EIP5749ProviderWithInfo> =>
            Promise.resolve(provider),
        })
      );
      allWallets.push(...eip5749Options);
    }

    // some wallets aggressively put themselves in the list of wallets the user has installed
    // even if the user has never actually used these
    // we put these wallets at the bottom of the priority
    const aggressiveWallets = ["com.brave.wallet"];
    allWallets.sort((a, b) => {
      const aAggressive = aggressiveWallets.includes(a.metadata.name);
      const bAggressive = aggressiveWallets.includes(b.metadata.name);
      if (aAggressive && !bAggressive) return 1;
      if (bAggressive && !aAggressive) return -1;
      return 0;
    });
    return allWallets;
  }
  static getWalletOptions(): ConnectionOption<EvmApi>[] {
    const withDuplicates =
      EvmInjectedConnector.getPossiblyDuplicateWalletOptions();
    const seenNames: Set<string> = new Set();
    const seenDisplayNames: Set<string> = new Set();

    const result: ConnectionOption<EvmApi>[] = [];
    for (const option of withDuplicates) {
      const lowerCaseName = option.metadata.displayName.toLowerCase();
      if (seenNames.has(option.metadata.name)) continue;
      if (seenDisplayNames.has(lowerCaseName)) continue;
      seenNames.add(option.metadata.name);
      seenDisplayNames.add(lowerCaseName);
      result.push(option);
    }

    return result;
  }

  static instance(): EvmInjectedConnector {
    if (EvmInjectedConnector.INSTANCE == null) {
      const newInstance = new EvmInjectedConnector();
      EvmInjectedConnector.INSTANCE = newInstance;
    }
    return EvmInjectedConnector.INSTANCE;
  }
  connectSimple = async (): Promise<EvmInjectedProvider> => {
    if (this.provider != null) {
      return this.provider;
    }
    const options = EvmInjectedConnector.getWalletOptions();
    if (options.length === 0) {
      throw new Error(`No EVM wallet found`);
    }
    return await this.connectExternal(await optionToActive(options[0]));
  };
  connectExternal = async (
    conn: ActiveConnection<EvmApi>
  ): Promise<EvmInjectedProvider> => {
    if (this.provider?.getConnection().metadata?.name === conn.metadata.name) {
      return this.provider;
    }
    this.provider = await EvmInjectedProvider.init(conn);

    // Update the selected Eth address if the user changes after logging in.
    // warning: not supported by all wallets (ex: Flint)
    const ethereum: EIP1193Provider = (getWindow() as any).ethereum;
    ethereum?.on("accountsChanged", (newAccounts) => {
      const accounts = newAccounts as string[];
      if (!accounts || !accounts[0] || accounts[0] !== this.provider?.address) {
        this.provider = undefined;
      }
    });
    return this.provider;
  };
  connectNamed = async (name: string): Promise<EvmInjectedProvider> => {
    if (this.provider?.getConnection().metadata?.name === name) {
      return this.provider;
    }

    // the eip6963 name for Metamask is io.metamask
    // but we want to keep simply "metamask" working for backwards compatibility with older versions of Paima
    const adjustedName =
      name.toLocaleLowerCase() === "metamask" ? "io.metamask" : name;
    const provider =
      EvmInjectedConnector.getPossiblyDuplicateWalletOptions().find(
        (entry) => entry.metadata.name === adjustedName
      );
    if (provider == null) {
      throw new Error(`EVM wallet ${name} not found`);
    }
    return await this.connectExternal(await optionToActive(provider));
  };
  getProvider = (): undefined | EvmInjectedProvider => {
    return this.provider;
  };
  getOrThrowProvider = (): EvmInjectedProvider => {
    if (this.provider == null) {
      throw new Error(`EvmInjectedConnector not initialized yet`);
    }
    return this.provider;
  };
  isConnected = (): boolean => {
    return this.provider != null;
  };
}

/**
 * For some reason I can't find any official type definitions for this
 * https://docs.metamask.io/wallet/reference/eth_sendtransaction/
 */
type Web3TransactionRequest = {
  to?: string;
  from: string;

  gas?: string;
  gasPrice?: string;

  data: string;
  value?: string;

  maxPriorityFeePerGas?: string;
  maxFeePerGas?: string;
};

export class EvmInjectedProvider implements IProvider<EvmApi> {
  constructor(
    private readonly conn: ActiveConnection<EvmApi>,
    readonly address: EvmAddress
  ) {}
  static init = async (
    conn: ActiveConnection<EvmApi>
  ): Promise<EvmInjectedProvider> => {
    const accounts = (await conn.api.request({
      method: "eth_requestAccounts",
    })) as string[];
    if (!accounts || accounts.length === 0) {
      throw new Error("Unknown error while receiving EVM accounts");
    }

    return new EvmInjectedProvider(conn, accounts[0]);
  };
  getConnection = (): ActiveConnection<EvmApi> => {
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
    const signature = await this.conn.api.request({
      method: "personal_sign",
      params: [hexMessage, this.getAddress().address, ""],
    });
    if (typeof signature !== "string") {
      console.log("[signMessageEth] invalid signature:", signature);
      throw new Error(
        `[signMessageEth] Received signature of type ${typeof signature}`
      );
    }
    return signature;
  };
  verifyWalletChain = async (): Promise<boolean> => {
    try {
      const walletChain = await this.conn.api.request({
        method: "eth_chainId",
      });
      return true;
      // TODO We have to move this to the top level
      // return (
      //   parseInt(walletChain as string, 16) ===
      //   parseInt(this.gameInfo.gameChainId, 16)
      // );
    } catch (e: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      throw new Error(`[verifyWalletChain] error: ${e?.message}`, e?.code);
    }
  };
  addChain = async (newChain: AddEthereumChainParameter): Promise<void> => {
    try {
      // careful: not all wallets support adding arbitrary chains
      await this.conn.api.request({
        method: "wallet_addEthereumChain",
        params: [newChain],
      });
    } catch (e: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      throw new Error(`[addChain] error: ${e?.message}`, e?.code);
    }
  };
  switchChain = async (hexChainId: string): Promise<void> => {
    try {
      // careful: not all wallets support switching chains
      await this.conn.api.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexChainId }],
      });
    } catch (e: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      throw new Error(`[switchChain] error: ${e?.message}`, e?.code);
    }
  };
  sendTransaction = async (
    tx: Web3TransactionRequest
  ): Promise<{
    txHash: string;
  }> => {
    await this.verifyWalletChain();
    try {
      const hash = await this.conn.api.request({
        method: "eth_sendTransaction",
        params: [tx],
      });
      if (typeof hash !== "string") {
        console.log("[sendTransaction] invalid signature:", hash);
        throw new Error(
          `[sendTransaction] Received "hash" of type ${typeof hash}`
        );
      }
      return {
        txHash: hash,
      };
    } catch (e: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      throw new Error(`[sendTransaction] error: ${e?.message}`, e?.code);
    }
  };
}
