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
  chain.rpc = ["http://127.0.0.1:8545"];
  chain.explorers = [];
  chain.name = "Local Hardhat";
  const wallet = new LocalWallet({ chain });
  // We will load a wallet that has preloaded funds.
  // DO NOT EVER USE THIS KEY IN PRODUCTION.
  await wallet.import({
    privateKey: "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
    encryption: {
      decrypt: (message: string, password: string) => Promise.resolve(message),
      password: "",
    }
  })
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
