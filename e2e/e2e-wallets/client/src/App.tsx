import { useState } from "react";
import "./App.css";
import { walletLogin } from "@paima/wallets";
import { WalletMode } from "@paima/wallets";
import type { Wallet } from "@paima/wallets";
// import * as T from "@paima/types";

function App() {
  const [error, setError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);

  const handleLogin = async (loginAction: () => Promise<any>) => {
    setError(null);
    setWallet(null);
    try {
      const result = await loginAction();
      if (result.success) {
        setWallet(result.result);
      } else {
        setError(result.errorMessage);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="container">
      <h1>E2E Wallets</h1>
      <h2>Connect Wallet</h2>
      <div className="card">
        <button onClick={() => handleLogin(() => walletLogin({
          mode: WalletMode.EvmInjected,
          preference: {
            name: "MetaMask",
          },
          preferBatchedchedMode: false,
          checkChainId: false,
        }))}>
          EVM (Metamask)
        </button>
        <button onClick={() => handleLogin(() => walletLogin({
          mode: WalletMode.Cardano,
          preference: {
            name: "Nami",
          },
          checkChainId: false,
        }))}>
          Cardano (Nami)
        </button>
        <button onClick={() => handleLogin(() => walletLogin({
          mode: WalletMode.Polkadot,
          preference: {
            name: "Polkadot.js",
          },
        }))}>
          Polkadot (Polkadot.js)
        </button>
        <button onClick={() => handleLogin(() => walletLogin({
          mode: WalletMode.Algorand,
          preference: {
            name: "Pera",
          },
        }))}>
          Algorand (Pera)
        </button>
        <button onClick={() => handleLogin(() => walletLogin({
          mode: WalletMode.Mina,
          preference: {
            name: "Auro",
          },
        }))}>
          Mina (Auro)
        </button>
      </div>

      {wallet && (
        <div className="info-box">
          <h2>Wallet Info</h2>
          <pre>{JSON.stringify(wallet, null, 2)}</pre>
        </div>
      )}

      {error && (
        <div className="info-box error-box">
          <h2>Error</h2>
          <pre>{error}</pre>
        </div>
      )}
    </div>
  );
}

export default App;
