import { useEffect, useState } from "react";
import "./App.css";

// Import components
import { Header } from "./components/Header.tsx";
import { WalletDemo } from "./components/WalletDemo.tsx";
import { blockWatcher } from "./hooks/BlockWatcher.ts";

// Import hooks

// Import wallet context
import { WalletProvider } from "./contexts/WalletContext.tsx";

function App() {
  const [latestBlock, setLatestBlock] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const watchBlocks = async () => {
      let currentBlock = await blockWatcher.waitForBlock("__main__", 0);
      if (isMounted) {
        setLatestBlock(currentBlock);
        setIsConnected(true);
      }

      while (isMounted) {
        currentBlock = await blockWatcher.waitForBlock(
          "__main__",
          currentBlock + 1,
        );
        if (isMounted) {
          setLatestBlock(currentBlock);
        }
      }
    };

    watchBlocks();

    return () => {
      isMounted = false;
    };
  }, []);

  // Error handling for uncaught promises
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "r" && event.ctrlKey) {
        event.preventDefault();
        console.log("🔄 Manually refreshed (keyboard shortcut)");
        // You could add manual refresh logic here if needed
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <WalletProvider>
      <div className="container">
        <Header
          latestBlock={latestBlock}
          isConnected={isConnected}
        />

        <WalletDemo />
      </div>
    </WalletProvider>
  );
}

export default App;
