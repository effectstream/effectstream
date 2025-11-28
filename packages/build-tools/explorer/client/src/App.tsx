import { useEffect, useState } from "react";
import "./App.css";

// Import components
import { Header } from "./components/Header.tsx";
import { ColumnsContainer } from "./components/ColumnsContainer.tsx";
import { TableSection } from "./components/TableSection.tsx";
import { BatcherInput } from "./components/BatcherInput.tsx";
import { TablesMultiSelectModal } from "./components/TablesMultiSelectModal.tsx";

// Import hooks
import { useBlockchainData } from "./hooks/useBlockchainData.ts";
import { useTableData } from "./hooks/useTableData.ts";

function App() {
  const [selectedPrimitives, setSelectedPrimitives] = useState<string[]>([]);
  const [selectedUserTables, setSelectedUserTables] = useState<string[]>([]);
  const [primitivesInitialized, setPrimitivesInitialized] = useState(false);
  const [userTablesInitialized, setUserTablesInitialized] = useState(false);
  const [isPrimitivesModalOpen, setIsPrimitivesModalOpen] = useState(false);
  const [isUserTablesModalOpen, setIsUserTablesModalOpen] = useState(false);

  // Use custom hooks for data management
  const {
    chainConfigs,
    newBlockIndices,
    latestBlock,
    isConnected,
    isLoadingConfig,
    configError,
  } = useBlockchainData();

  const {
    primitiveData,
    userTableData,
    scheduledData,
    primitiveNames,
    userTableNames,
    primitivePagination,
    userTablePagination,
    nextPrimitivePage,
    prevPrimitivePage,
    firstPrimitivePage,
    setPrimitiveLimit,
    nextUserTablePage,
    prevUserTablePage,
    firstUserTablePage,
    setUserTableLimit,
  } = useTableData();

  useEffect(() => {
    if (primitiveNames.length > 0 && !primitivesInitialized) {
      setSelectedPrimitives(primitiveNames);
      setPrimitivesInitialized(true);
    }
  }, [primitiveNames, primitivesInitialized]);

  useEffect(() => {
    if (userTableNames.length > 0 && !userTablesInitialized) {
      setSelectedUserTables(userTableNames.slice(0, 4));
      setUserTablesInitialized(true);
    }
  }, [userTableNames, userTablesInitialized]);

  // Error handling for uncaught promises
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);
    };

    globalThis.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      globalThis.removeEventListener(
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

  // Show loading state while configs are being fetched
  if (isLoadingConfig) {
    return (
      <div className="container">
        <Header
          latestBlock={latestBlock}
          isConnected={isConnected}
        />
        <div
          style={{
            padding: "20px",
            textAlign: "center",
            fontSize: "18px",
            color: "#667eea",
          }}
        >
          🔄 Loading chain configurations...
        </div>
      </div>
    );
  }

  // Show error state if config loading failed
  if (configError) {
    return (
      <div className="container">
        <Header
          latestBlock={latestBlock}
          isConnected={isConnected}
        />
        <div
          style={{
            padding: "20px",
            textAlign: "center",
            fontSize: "16px",
            color: "#f44336",
            backgroundColor: "rgba(244, 67, 54, 0.1)",
            border: "1px solid rgba(244, 67, 54, 0.3)",
            borderRadius: "8px",
            margin: "20px",
          }}
        >
          ⚠️ Failed to load chain configurations: {configError}
          <br />
          <small style={{ color: "#666", marginTop: "8px", display: "block" }}>
            Using fallback configuration. Some features may not work correctly.
          </small>
        </div>
        <ColumnsContainer
          chainConfigs={chainConfigs}
          newBlockIndices={newBlockIndices}
        />
      </div>
    );
  }

  return (
    <div className="container">
      <Header
        latestBlock={latestBlock}
        isConnected={isConnected}
      />

      <ColumnsContainer
        chainConfigs={chainConfigs}
        newBlockIndices={newBlockIndices}
      />

      <TableSection
        title="Primitive Data"
        tables={Object.fromEntries(
          Object.entries(primitiveData).filter(([key]) =>
            selectedPrimitives.includes(key)
          ),
        )}
        pagination={primitivePagination}
        onPrev={(name) => prevPrimitivePage(name)}
        onNext={(name) => nextPrimitivePage(name)}
        onFirst={(name) => firstPrimitivePage(name)}
        onLimitChange={(name, limit) => setPrimitiveLimit(name, limit)}
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className="batcher-api-button"
            onClick={() => setIsPrimitivesModalOpen(true)}
          >
            Select Primitives
          </button>
        </div>
        <TablesMultiSelectModal
          isOpen={isPrimitivesModalOpen}
          onClose={() => setIsPrimitivesModalOpen(false)}
          title="Select Primitives"
          tableNames={primitiveNames}
          selectedNames={selectedPrimitives}
          onApply={(names) => setSelectedPrimitives(names)}
        />
      </TableSection>

      <TableSection
        title="State Machine Tables"
        tables={Object.fromEntries(
          Object.entries(userTableData).filter(([key]) =>
            selectedUserTables.includes(key)
          ),
        )}
        pagination={userTablePagination}
        onPrev={(name) => prevUserTablePage(name)}
        onNext={(name) => nextUserTablePage(name)}
        onFirst={(name) => firstUserTablePage(name)}
        onLimitChange={(name, limit) => setUserTableLimit(name, limit)}
      >
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button
            type="button"
            className="batcher-api-button"
            onClick={() => setIsUserTablesModalOpen(true)}
          >
            Select Tables
          </button>
        </div>
        <TablesMultiSelectModal
          isOpen={isUserTablesModalOpen}
          onClose={() => setIsUserTablesModalOpen(false)}
          title="Select Custom Tables"
          tableNames={userTableNames}
          selectedNames={selectedUserTables}
          onApply={(names) => setSelectedUserTables(names)}
        />
        {/* <BatcherInput /> */}
      </TableSection>

      <TableSection
        title="Scheduled Data"
        tables={scheduledData}
      />
    </div>
  );
}

export default App;
