import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
// import { createWalletClient, custom, http, type WalletClient } from "viem";
// import { WalletBuilder } from "@midnight-ntwrk/wallet";
import * as MidnightWallet from "@midnight-ntwrk/wallet";
import { type Wallet, walletLogin } from "@effectstream/wallets";
type LoginInfo = any;

console.log("🔗 [WALLET] MidnightWallet", MidnightWallet);

interface WalletContextType {
  isConnected: boolean;
  address: string | null;
  wallet: Wallet | null;
  connectEvmWallet: (loginInfo: LoginInfo) => Promise<void>;
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
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = () => {
    setIsModalOpen(true);
  };
  const closeModal = () => {
    setIsModalOpen(false);
  };

  const connectEvmWallet = async (loginInfo: LoginInfo) => {
    const response = await walletLogin(loginInfo);
    if (response.success) {
      setWallet(response.result);
      setAddress(response.result.walletAddress);
      setIsConnected(true);
      closeModal();
      console.log(
        "🔗 [WALLET] Wallet connected:",
        response.result.walletAddress,
      );
    } else {
      console.error("Failed to connect wallet:", response.errorMessage);
      throw new Error(response.errorMessage);
    }
  };

  const value: WalletContextType = {
    isConnected,
    address,
    wallet,
    connectEvmWallet,
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
