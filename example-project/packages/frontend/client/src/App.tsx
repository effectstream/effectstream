import { useEffect } from "react";
import "./App.css";

// Import components
import { Header } from "./components/Header.tsx";
import { ColumnsContainer } from "./components/ColumnsContainer.tsx";
import { WalletDemo } from "./components/WalletDemo.tsx";

// Import hooks
import { useBlockchainData } from "./hooks/useBlockchainData.ts";
import { useTableData } from "./hooks/useTableData.ts";

// Import wallet context
import { WalletProvider } from "./contexts/WalletContext.tsx";

function App() {
  // Use custom hooks for data management
  const {
    // chainConfigs,
    // newBlockIndices,
    latestBlock,
    isConnected,
  } = useBlockchainData();

  // const {
  //   primitiveData,
  //   staticTableData,
  //   scheduledData,
  // } = useTableData();

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
