import { useEffect } from "react";
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
  // Use custom hooks for data management
  const {
    chainConfigs,
    newBlockIndices,
    latestBlock,
    isConnected,
  } = useBlockchainData();

  const {
    primitiveData,
    staticTableData,
    scheduledData,
    primitivePagination,
    staticTablePagination,
    nextPrimitivePage,
    prevPrimitivePage,
    firstPrimitivePage,
    setPrimitiveLimit,
    nextStaticTablePage,
    prevStaticTablePage,
    firstStaticTablePage,
    setStaticTableLimit,
  } = useTableData();

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
      />

      <ColumnsContainer
        chainConfigs={chainConfigs}
        newBlockIndices={newBlockIndices}
      />

      <TableSection
        title="Primitive Data"
        tables={primitiveData}
        pagination={primitivePagination}
        onPrev={(name) => prevPrimitivePage(name)}
        onNext={(name) => nextPrimitivePage(name)}
        onFirst={(name) => firstPrimitivePage(name)}
        onLimitChange={(name, limit) => setPrimitiveLimit(name, limit)}
      />

      <TableSection
        title="State Machine Tables"
        tables={staticTableData}
        pagination={staticTablePagination}
        onPrev={(name) => prevStaticTablePage(name)}
        onNext={(name) => nextStaticTablePage(name)}
        onFirst={(name) => firstStaticTablePage(name)}
        onLimitChange={(name, limit) => setStaticTableLimit(name, limit)}
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
