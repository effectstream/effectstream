import { useWallet } from "../contexts/WalletContext.tsx";
import { WalletMode } from "@paimaexample/wallets";
import { LocalWallet } from "@thirdweb-dev/wallets";
import { getChainByChainIdAsync } from "@thirdweb-dev/chains";
import { paimaEngineConfig } from "../PaimaEngineConfig.ts";

interface WalletModalProps {
  onClose: () => void;
}

async function getLocalWallet() {
  const chain = await getChainByChainIdAsync(paimaEngineConfig.paimaL2Chain.id);
  const wallet = new LocalWallet({ chain });
  await wallet.loadOrCreate({
    strategy: "encryptedJson",
    password: "",
  });
  await wallet.connect();
  return await wallet.getSigner();
}

export function WalletModal({ onClose }: WalletModalProps) {
  const { connectEvmWallet } = useWallet();

  const handleConnect = async (mode: WalletMode) => {
    try {
      if (mode === WalletMode.EvmEthers) {
        const localWallet = await getLocalWallet();
        await connectEvmWallet({
          mode: WalletMode.EvmEthers,
          connection: {
            metadata: {
              name: "thirdweb.localwallet",
              displayName: "Local Wallet",
            },
            api: localWallet,
          },
        });
      } else {
        const loginInfo /*: LoginInfo*/ = {
          mode: mode,
          chain: paimaEngineConfig.paimaL2Chain,
        };
        await connectEvmWallet(loginInfo);
      }
      onClose();
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      // Handle error display to the user if necessary
    }
  };

  return (
    <div className="wallet-modal-overlay">
      <div className="wallet-modal-content">
        <button onClick={onClose} className="wallet-modal-close">
          &times;
        </button>
        <h2 className="wallet-modal-title">Connect Wallet</h2>
        <p className="wallet-modal-subtitle">
          Choose your preferred wallet to continue
        </p>
        <div className="wallet-options">
          <button
            onClick={() => handleConnect(WalletMode.EvmInjected)}
            className="wallet-option-button metamask"
          >
            Connect Browser Wallet (MetaMask)
          </button>
          <button
            onClick={() => handleConnect(WalletMode.EvmEthers)}
            className="wallet-option-button local-wallet"
          >
            Connect Local Wallet
          </button>
        </div>
      </div>
    </div>
  );
}
