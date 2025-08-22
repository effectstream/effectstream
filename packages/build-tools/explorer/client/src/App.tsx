import { useEffect, useState } from "react";
import "./App.css";

// Import components
import { Header } from "./components/Header.tsx";
import { ColumnsContainer } from "./components/ColumnsContainer.tsx";
import { TableSection } from "./components/TableSection.tsx";
import { BatcherInput } from "./components/BatcherInput.tsx";

// Import hooks
import { useBlockchainData } from "./hooks/useBlockchainData.ts";
import { useTableData } from "./hooks/useTableData.ts";

function App() {
  const [selectedPrimitives, setSelectedPrimitives] = useState<string[]>([]);
  const [selectedUserTables, setSelectedUserTables] = useState<string[]>([]);

  // Use custom hooks for data management
  const {
    chainConfigs,
    newBlockIndices,
    latestBlock,
    isConnected,
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
    if (primitiveNames.length > 0 && selectedPrimitives.length === 0) {
      setSelectedPrimitives([primitiveNames[0]]);
    }
  }, [primitiveNames, selectedPrimitives]);

  useEffect(() => {
    if (userTableNames.length > 0 && selectedUserTables.length === 0) {
      setSelectedUserTables([userTableNames[0]]);
    }
  }, [userTableNames, selectedUserTables]);

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

  return (
    <div className="container">
      <Header
        latestBlock={latestBlock}
        isConnected={isConnected}
        primitiveNames={primitiveNames}
        userTableNames={userTableNames}
        onSelectPrimitive={(name) => setSelectedPrimitives([name])}
        onSelectUserTable={(name) => setSelectedUserTables([name])}
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
      />

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
        <BatcherInput />
      </TableSection>

      <TableSection
        title="Scheduled Data"
        tables={scheduledData}
      />
    </div>
  );
}

export default App;
