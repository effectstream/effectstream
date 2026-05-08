import {
  createContext,
  type ReactNode,
  useContext,
  useState,
} from "react";
import { type Wallet, walletLogin, WalletMode } from "@effectstream/wallets";
import { LocalWallet } from "@thirdweb-dev/wallets";
import { getChainByChainIdAsync } from "@thirdweb-dev/chains";
import { paimaEngineConfig } from "../PaimaEngineConfig.ts";

type LoginInfo = any;

const LOCAL_WALLET_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function getLocalWallet() {
  const chain = await getChainByChainIdAsync(paimaEngineConfig.effectstreamL2Chain.id);
  chain.rpc = ["http://127.0.0.1:8545"];
  chain.explorers = [];
  chain.name = "Local Hardhat";
  const wallet = new LocalWallet({ chain });
  await wallet.import({
    privateKey: LOCAL_WALLET_KEY,
    encryption: {
      decrypt: (message: string, _password: string) => Promise.resolve(message),
      password: "",
    },
  });
  await wallet.connect();
  return await wallet.getSigner();
}

interface WalletContextType {
  address: string | null;
  wallet: Wallet | null;
  isConnecting: boolean;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  connectWallet: (loginInfo: LoginInfo) => Promise<void>;
  connectLocalWallet: () => Promise<void>;
  connectBrowserWallet: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = () => setIsModalOpen(true);
  const closeModal = () => setIsModalOpen(false);

  const connectWallet = async (loginInfo: LoginInfo) => {
    setIsConnecting(true);
    try {
      const response = await walletLogin(loginInfo);
      if (response.success) {
        setWallet(response.result);
        setAddress(response.result.walletAddress);
        closeModal();
      } else {
        console.error("Wallet login failed:", response.errorMessage);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const connectLocalWallet = async () => {
    const localWallet = await getLocalWallet();
    await connectWallet({
      mode: WalletMode.EvmEthers,
      connection: {
        metadata: { name: "thirdweb.localwallet", displayName: "Local Wallet" },
        api: localWallet,
      },
    });
  };

  const connectBrowserWallet = async () => {
    await connectWallet({
      mode: WalletMode.EvmInjected,
      chain: paimaEngineConfig.effectstreamL2Chain,
    });
  };

  const disconnect = () => {
    setAddress(null);
    setWallet(null);
  };

  return (
    <WalletContext.Provider value={{
      address, wallet, isConnecting, isModalOpen,
      openModal, closeModal,
      connectWallet, connectLocalWallet, connectBrowserWallet, disconnect,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
