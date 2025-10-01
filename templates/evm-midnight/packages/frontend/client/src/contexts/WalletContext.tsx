import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { createWalletClient, custom, http, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
// import { WalletBuilder } from "@midnight-ntwrk/wallet";
import * as MidnightWallet from "@midnight-ntwrk/wallet";
console.log("🔗 [WALLET] MidnightWallet", MidnightWallet);
// Cannot import:
// ../../node_modules/.deno/@midnight-ntwrk+compact-runtime@0.8.1/node_modules/
// @midnight-ntwrk/compact-runtime/dist/runtime.js:43:21:
// ERROR: This require call is not allowed because the transitive dependency
// "vite-plugin-wasm-namespace:/Users/username/paima-sample/node_modules/
// .deno/@midnight-ntwrk+onchain-runtime@0.3.0/node_modules/@midnight-ntwrk/
// onchain-runtime/midnight_onchain_runtime_wasm_bg.wasm" contains a top-level await
// import {
// getLedgerNetworkId,
// getZswapNetworkId,
// } from "@midnight-ntwrk/midnight-js-network-id";

// Removed automatic Midnight wallet connection - now handled manually via UI

interface WalletContextType {
  isConnected: boolean;
  address: string | null;
  walletClient: WalletClient | null;
  walletType: "local" | "browser" | null;
  connectEvmWallet: () => void;
  connectBrowserWallet: () => Promise<void>;
  connectLocalWallet: () => Promise<void>;
  disconnectWallet: () => void;
  signMessage: (message: string) => Promise<string>;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null);
  const [walletType, setWalletType] = useState<"local" | "browser" | null>(
    null,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Check if wallet is already connected on mount
  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    if (typeof globalThis !== "undefined" && (globalThis as any).ethereum) {
      try {
        const accounts = await (globalThis as any).ethereum.request({
          method: "eth_accounts",
        });

        if (accounts.length > 0) {
          const client = createWalletClient({
            transport: custom((globalThis as any).ethereum),
          });

          setWalletClient(client);
          setAddress(accounts[0]);
          setIsConnected(true);
          setWalletType("browser");
        }
      } catch (error) {
        console.error("Error checking wallet connection:", error);
      }
    }
  };

  const openModal = () => {
    setIsModalOpen(true);
  };
  const closeModal = () => {
    setIsModalOpen(false);
  };

  const connectEvmWallet = () => {
    openModal();
  };

  const connectBrowserWallet = async () => {
    if (typeof globalThis !== "undefined" && (globalThis as any).ethereum) {
      try {
        const accounts = await (globalThis as any).ethereum.request({
          method: "eth_requestAccounts",
        });

        const client = createWalletClient({
          transport: custom((globalThis as any).ethereum),
        });

        setWalletClient(client);
        setAddress(accounts[0]);
        setIsConnected(true);
        setWalletType("browser");
        closeModal();

        console.log("🔗 [WALLET] MetaMask connected:", accounts[0]);
      } catch (error) {
        console.error("Failed to connect wallet:", error);
        throw error;
      }
    } else {
      throw new Error("MetaMask is not installed");
    }
  };

  const connectLocalWallet = async () => {
    try {
      const account = privateKeyToAccount(
        "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
      );
      const client = createWalletClient({
        account,
        chain: mainnet,
        transport: http(),
      });
      setWalletClient(client);
      setAddress(account.address);
      setIsConnected(true);
      setWalletType("local");
      closeModal();
      console.log("🔗 [WALLET] Local wallet connected:", account.address);
    } catch (error) {
      console.error("Failed to connect local wallet:", error);
      throw error;
    }
  };

  const disconnectWallet = () => {
    setWalletClient(null);
    setAddress(null);
    setIsConnected(false);
    setWalletType(null);
    console.log("🔗 [WALLET] Wallet disconnected");
  };

  // deno-lint-ignore require-await
  const signMessage = async (message: string): Promise<string> => {
    if (!walletClient || !address) {
      throw new Error("Wallet not connected");
    }

    try {
      const signature = await walletClient.signMessage({
        account: address as `0x${string}`,
        message,
      });

      console.log("✍️ [WALLET] Message signed:", message);
      return signature;
    } catch (error) {
      console.error("Failed to sign message:", error);
      throw error;
    }
  };

  // Listen for account changes
  useEffect(() => {
    if (typeof globalThis !== "undefined" && (globalThis as any).ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else if (accounts[0] !== address) {
          setAddress(accounts[0]);
          console.log("🔗 [WALLET] Account changed:", accounts[0]);
        }
      };

      const handleChainChanged = () => {
        // Reload the page when chain changes for simplicity
        (globalThis as any).location.reload();
      };

      (globalThis as any).ethereum.on("accountsChanged", handleAccountsChanged);
      (globalThis as any).ethereum.on("chainChanged", handleChainChanged);

      return () => {
        (globalThis as any).ethereum.removeListener(
          "accountsChanged",
          handleAccountsChanged,
        );
        (globalThis as any).ethereum.removeListener(
          "chainChanged",
          handleChainChanged,
        );
      };
    }
  }, [address]);

  const value: WalletContextType = {
    isConnected,
    address,
    walletClient,
    walletType,
    connectEvmWallet,
    connectBrowserWallet,
    connectLocalWallet,
    disconnectWallet,
    signMessage,
    isModalOpen,
    openModal,
    closeModal,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

// Extend Window interface for ethereum
declare global {
  interface Window {
    ethereum?: any;
  }
}
