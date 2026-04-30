import { useState } from "react";
import { useWallet } from "../contexts/WalletContext.tsx";
import { WalletMode } from "@effectstream/wallets";
import { LocalWallet } from "@thirdweb-dev/wallets";
import { getChainByChainIdAsync } from "@thirdweb-dev/chains";
import { paimaEngineConfig } from "../PaimaEngineConfig.ts";

const LOCAL_WALLET_KEY = "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356";

interface WalletModalProps {
  onClose: () => void;
}

async function getLocalWallet() {
  const chain = await getChainByChainIdAsync(paimaEngineConfig.effectstreamL2Chain.id);
  chain.rpc = ["http://127.0.0.1:8545"];
  chain.explorers = [];
  chain.name = "Local Hardhat";
  const wallet = new LocalWallet({ chain });
  // We will load a wallet that has preloaded funds.
  // DO NOT EVER USE THIS KEY IN PRODUCTION.
  await wallet.import({
    privateKey: LOCAL_WALLET_KEY,
    encryption: {
      decrypt: (message: string, password: string) => Promise.resolve(message),
      password: "",
    }
  })
  await wallet.connect();
  return await wallet.getSigner();
}

function getDetectedWallets(): string[] {
  if (typeof window === "undefined") return [];
  const eth = (window as any).ethereum;
  if (!eth) return [];
  const providers: any[] = eth.providers ?? [eth];
  const names: string[] = [];
  for (const p of providers) {
    // Check specific flags first (most specific → least).
    // Many wallets also set isMetaMask for compatibility, so check
    // their own flag before falling through to the MetaMask check.
    if (p.isBraveWallet) names.push("Brave");
    else if (p.isRabby) names.push("Rabby");
    else if (p.isCoinbaseWallet) names.push("Coinbase");
    else if (p.isPhantom) names.push("Phantom");
    else if (p.isTrust) names.push("Trust");
    else if (p.isFrame) names.push("Frame");
    else if (p.isTokenPocket) names.push("TokenPocket");
    else if (p.isMetaMask) names.push("MetaMask");
    else if (p.info?.name) names.push(p.info.name);
    else names.push("EVM Wallet");
  }
  return names;
}

export function WalletModal({ onClose }: WalletModalProps) {
  const { connectEvmWallet } = useWallet();
  const detectedWallets = getDetectedWallets();
  const [copied, setCopied] = useState(false);

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
          chain: paimaEngineConfig.effectstreamL2Chain,
        };
        await connectEvmWallet(loginInfo);
      }
      onClose();
    } catch (error) {
      console.error("Failed to connect wallet:", error);
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
            onClick={() => handleConnect(WalletMode.EvmEthers)}
            className="wallet-option-button local-wallet"
          >
            <span>Connect Local Wallet</span>
            <span className="recommended-badge">RECOMMENDED</span>
          </button>
          <div className="wallet-disclaimer">
            Uses Hardhat account #1 with pre-loaded gas for the local network.
            <br />
            Key: <code>0x4bbbf...cbf4356</code>
            <button
              type="button"
              className="copy-key-btn"
              onClick={() => {
                navigator.clipboard.writeText(LOCAL_WALLET_KEY);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => handleConnect(WalletMode.EvmInjected)}
            className="wallet-option-button metamask"
          >
            <span>Connect Browser Wallet</span>
            {detectedWallets.length > 0 && (
              <span className="detected-badge">{detectedWallets.join(", ")}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
