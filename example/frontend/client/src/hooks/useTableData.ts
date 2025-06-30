import { useCallback, useEffect, useState } from "react";

interface Field {
  name: string;
  dataTypeID: number;
}

interface TableData {
  command?: string;
  rowCount: number;
  rows: any[];
  fields: Field[];
}

const CONFIG_ENDPOINT = "http://127.0.0.1:9999/config";
const PRIMITIVES_ENDPOINT = "http://127.0.0.1:9999/primitives";
const TABLES_ENDPOINT = "http://127.0.0.1:9999/tables";

export function useTableData() {
  const [primitiveNames, setPrimitiveNames] = useState<string[]>([]);
  const [primitiveData, setPrimitiveData] = useState<
    Record<string, TableData | null>
  >({});
  const [staticTableData, setStaticTableData] = useState<
    Record<string, TableData | null>
  >({});
  const [isLoadingPrimitives, setIsLoadingPrimitives] = useState(true);
  const [isLoadingStatic, setIsLoadingStatic] = useState(true);

  // Convert primitive data (direct array) to TableData format
  const convertPrimitiveDataToTableFormat = useCallback(
    (primitiveData: any, primitiveName: string): TableData | null => {
      if (!Array.isArray(primitiveData) || primitiveData.length === 0) {
        return null;
      }

      // Extract field names from the first row
      const fields = Object.keys(primitiveData[0]).map((key) => ({
        name: key,
        dataTypeID: 25, // Default to text type
      }));

      return {
        command: "SELECT",
        rowCount: primitiveData.length,
        rows: primitiveData,
        fields: fields,
      };
    },
    [],
  );

  // Convert table data to TableData format
  const convertTableDataToTableFormat = useCallback(
    (tableData: any, tableName: string): TableData | null => {
      // Handle new API structure where data has rows field in root
      const rows = tableData?.rows || tableData;

      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }

      // Extract field names from the first row
      const fields = Object.keys(rows[0]).map((key) => ({
        name: key,
        dataTypeID: 25, // Default to text type
      }));

      return {
        command: "SELECT",
        rowCount: rows.length,
        rows: rows,
        fields: fields,
      };
    },
    [],
  );

  // Fetch configuration
  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch(CONFIG_ENDPOINT);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const config = await response.json();
      console.log("📋 Fetched config:", config);
      return config;
    } catch (error) {
      console.error("Error fetching config:", error);
      return null;
    }
  }, []);

  // Extract primitive names from config
  const extractPrimitiveNames = useCallback((config: any): string[] => {
    const names: string[] = [];
    if (!config || !Array.isArray(config)) return names;

    config.forEach((syncProtocolConfig) => {
      if (
        syncProtocolConfig.primitives &&
        Array.isArray(syncProtocolConfig.primitives)
      ) {
        syncProtocolConfig.primitives.forEach((primitive: any) => {
          if (primitive.primitive && primitive.primitive.name) {
            names.push(primitive.primitive.name);
          }
        });
      }
    });

    return [...new Set(names)]; // Remove duplicates
  }, []);

  // Fetch primitive data
  const fetchPrimitiveData = useCallback(async (primitiveName: string) => {
    try {
      const response = await fetch(`${PRIMITIVES_ENDPOINT}/${primitiveName}`);
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`🚫 Primitive ${primitiveName} not found (404)`);
          return null;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log(`📊 Fetched data for ${primitiveName}:`, data);

      // Convert primitive data (direct array) to TableData format
      return convertPrimitiveDataToTableFormat(data, primitiveName);
    } catch (error) {
      console.error(
        `Error fetching primitive data for ${primitiveName}:`,
        error,
      );
      return null;
    }
  }, [convertPrimitiveDataToTableFormat]);

  // Fetch table data
  const fetchTableData = useCallback(async (tableName: string) => {
    try {
      const response = await fetch(`${TABLES_ENDPOINT}/${tableName}`);
      if (!response.ok) {
        if (response.status === 404) {
          console.log(`🚫 Table ${tableName} not found (404)`);
          return null;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log(`📊 Fetched table data for ${tableName}:`, data);
      return convertTableDataToTableFormat(data, tableName);
    } catch (error) {
      console.error(`Error fetching table data for ${tableName}:`, error);
      return null;
    }
  }, [convertTableDataToTableFormat]);

  // Refresh primitive data
  const refreshPrimitiveData = useCallback(async () => {
    if (primitiveNames.length === 0) return;

    try {
      const fetchPromises = primitiveNames.map(async (primitiveName) => {
        const data = await fetchPrimitiveData(primitiveName);
        return { primitiveName, data };
      });

      const results = await Promise.all(fetchPromises);

      const updatedData: Record<string, TableData | null> = {};
      results.forEach(({ primitiveName, data }) => {
        updatedData[primitiveName] = data;
      });

      setPrimitiveData(updatedData);
    } catch (error) {
      console.error("Error refreshing primitive data:", error);
    }
  }, [primitiveNames, fetchPrimitiveData]);

  // Refresh static table data
  const refreshStaticTableData = useCallback(async () => {
    try {
      const data = await fetchTableData("example_sm");
      setStaticTableData({ "example_sm": data });
    } catch (error) {
      console.error("Error refreshing static table data:", error);
    }
  }, [fetchTableData]);

  // Initialize primitive tables
  const initializePrimitiveTables = useCallback(async () => {
    console.log("📋 Initializing primitive tables...");
    setIsLoadingPrimitives(true);

    try {
      // Fetch configuration
      const config = await fetchConfig();
      if (!config) {
        console.error("Failed to fetch config");
        setIsLoadingPrimitives(false);
        return;
      }

      // Extract primitive names
      const names = extractPrimitiveNames(config);
      setPrimitiveNames(names);
      console.log("📊 Found primitives:", names);

      if (names.length === 0) {
        console.log("No primitives found in config");
        setIsLoadingPrimitives(false);
        return;
      }

      // Fetch data for each primitive
      const fetchPromises = names.map(async (primitiveName) => {
        const data = await fetchPrimitiveData(primitiveName);
        return { primitiveName, data };
      });

      const results = await Promise.all(fetchPromises);

      const initialData: Record<string, TableData | null> = {};
      results.forEach(({ primitiveName, data }) => {
        initialData[primitiveName] = data;
      });

      setPrimitiveData(initialData);
      console.log("✅ Primitive tables initialized");
    } catch (error) {
      console.error("Error initializing primitive tables:", error);
    } finally {
      setIsLoadingPrimitives(false);
    }
  }, [fetchConfig, extractPrimitiveNames, fetchPrimitiveData]);

  // Initialize static tables
  const initializeStaticTables = useCallback(async () => {
    console.log("📋 Initializing state machine tables...");
    setIsLoadingStatic(true);

    try {
      const data = await fetchTableData("example_sm");
      setStaticTableData({ "example_sm": data });
      console.log("✅ State machine tables initialized");
    } catch (error) {
      console.error("Error initializing state machine tables:", error);
    } finally {
      setIsLoadingStatic(false);
    }
  }, [fetchTableData]);

  // Initialize and setup refresh intervals
  useEffect(() => {
    // Initialize tables
    initializePrimitiveTables();
    initializeStaticTables();

    // Setup refresh interval
    const refreshInterval = setInterval(() => {
      refreshPrimitiveData();
      refreshStaticTableData();
    }, 1000);

    return () => {
      clearInterval(refreshInterval);
    };
  }, []);

  return {
    primitiveData,
    staticTableData,
    isLoadingPrimitives,
    isLoadingStatic,
    refreshPrimitiveData,
    refreshStaticTableData,
  };
}
