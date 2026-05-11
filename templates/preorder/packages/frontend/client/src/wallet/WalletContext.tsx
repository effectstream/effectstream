import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { WalletClient, PublicClient } from "viem";
import {
  createLocalWalletClient,
  createEvmPublicClient,
  connectInjectedWallet,
  mintMockUsdc,
} from "./evm-wallet.ts";
import { MOCK_USDC_ADDRESS } from "../config.ts";
import { createCardanoDevWallet, type CardanoDevWallet } from "./cardano-wallet.ts";
import type { LucidEvolution } from "@lucid-evolution/lucid";
import { useLog } from "../logs/LogContext.tsx";

type WalletMode =
  | "none"
  | "evm-local"
  | "evm-injected"
  | "cardano-dev"
  | "cardano-extension";

interface WalletState {
  mode: WalletMode;
  evmAddress: string | null;
  evmWalletClient: WalletClient | null;
  evmPublicClient: PublicClient | null;
  cardanoAddress: string | null;
  cardanoLucid: LucidEvolution | null;
  isConnecting: boolean;
  error: string | null;
  connectEvmLocal: () => Promise<void>;
  connectEvmInjected: () => Promise<void>;
  connectCardanoDev: () => Promise<void>;
  connectCardanoExtension: () => void;
  disconnect: () => void;
}

const WalletCtx = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWallet must be inside WalletProvider");
  return ctx;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<WalletMode>("none");
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [evmWalletClient, setEvmWalletClient] = useState<WalletClient | null>(null);
  const [evmPublicClient, setEvmPublicClient] = useState<PublicClient | null>(null);
  const [cardanoAddress, setCardanoAddress] = useState<string | null>(null);
  const [cardanoLucid, setCardanoLucid] = useState<LucidEvolution | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addLog } = useLog();

  const disconnect = useCallback(() => {
    setMode((prev) => {
      if (prev !== "none") addLog("info", "Wallet disconnected");
      return "none";
    });
    setEvmAddress(null);
    setEvmWalletClient(null);
    setEvmPublicClient(null);
    setCardanoAddress(null);
    setCardanoLucid(null);
    setError(null);
  }, [addLog]);

  const connectEvmLocal = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    addLog("pending", "Connecting EVM local wallet...", "Hardhat account #1 via privateKey");
    try {
      const wallet = createLocalWalletClient();
      const pub = createEvmPublicClient();
      addLog("info", "WalletClient created", "transport: http://localhost:8545 | chain: Hardhat (31337)");
      const [addr] = await wallet.getAddresses();
      try {
        await mintMockUsdc(wallet, pub, MOCK_USDC_ADDRESS as `0x${string}`, addr, 500_000_000_000n);
        addLog("info", "Minted 500,000 MUSDC to dev wallet");
      } catch { /* mint may fail if not deployer, non-critical */ }
      setEvmWalletClient(wallet);
      setEvmPublicClient(pub);
      setEvmAddress(addr);
      setMode("evm-local");
      addLog("success", "EVM wallet connected", addr);
    } catch (e: any) {
      setError(e.message);
      addLog("error", "EVM connection failed", e.message);
    } finally {
      setIsConnecting(false);
    }
  }, [addLog]);

  const connectEvmInjected = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    addLog("pending", "Requesting MetaMask accounts...", "eth_requestAccounts");
    try {
      const wallet = await connectInjectedWallet();
      const pub = createEvmPublicClient();
      const [addr] = await wallet.getAddresses();
      setEvmWalletClient(wallet);
      setEvmPublicClient(pub);
      setEvmAddress(addr);
      setMode("evm-injected");
      addLog("success", "MetaMask connected", addr);
    } catch (e: any) {
      setError(e.message);
      addLog("error", "MetaMask connection failed", e.message);
    } finally {
      setIsConnecting(false);
    }
  }, [addLog]);

  const connectCardanoDev = useCallback(async () => {
    setIsConnecting(true);
    setError(null);
    addLog("pending", "Creating Cardano dev wallet...", "Lucid + YACI DevKit (client-side)");
    try {
      addLog("info", "Generating seed phrase, deriving address...");
      const wallet = await createCardanoDevWallet();
      addLog("info", "Faucet topup complete — 10,000 tADA", wallet.address);
      setCardanoAddress(wallet.address);
      setCardanoLucid(wallet.lucid);
      setMode("cardano-dev");
      addLog("success", "Cardano wallet ready", wallet.address);
    } catch (e: any) {
      setError(e.message);
      addLog("error", "Cardano wallet creation failed", e.message);
    } finally {
      setIsConnecting(false);
    }
  }, [addLog]);

  const connectCardanoExtension = useCallback(() => {
    setError(
      "Browser extension wallets are supported on testnet/mainnet. Use 'Cardano Dev' for local development.",
    );
    addLog("info", "Extension wallets available on testnet/mainnet only");
  }, [addLog]);

  return (
    <WalletCtx.Provider
      value={{
        mode, evmAddress, evmWalletClient, evmPublicClient,
        cardanoAddress, cardanoLucid, isConnecting, error,
        connectEvmLocal, connectEvmInjected,
        connectCardanoDev, connectCardanoExtension, disconnect,
      }}
    >
      {children}
    </WalletCtx.Provider>
  );
}
