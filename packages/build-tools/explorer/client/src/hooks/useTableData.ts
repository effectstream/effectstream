import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONFIG_ENDPOINT,
  EVENTS_ENDPOINT,
  PRIMITIVES_ENDPOINT,
  PRIMITIVES_SCHEMA_ENDPOINT,
  SCHEDULED_DATA_ENDPOINT,
  TABLE_SCHEMA_ENDPOINT,
  TABLES_ENDPOINT,
} from "../config.ts";

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

interface SchemaColumn {
  column_name: string;
  data_type: string;
  character_maximum_length: number | null;
  column_default: string | null;
  is_nullable: string;
}

interface IGetAllScheduledDataResult {
  caip2: string | null;
  contract_address: string | null;
  from_address: string;
  future_block_height: number;
  future_ms_timestamp: string | null;
  id: number;
  input_data: string;
  origin_tx_hash: string | null;
  primitive_name: string | null;
}

export function useTableData() {
  interface PaginationMeta {
    limit: number;
    cursors: (string | undefined)[];
    currentPage: number;
    hasMore: boolean;
  }

  const DEFAULT_LIMIT = 20;

  const [primitiveNames, setPrimitiveNames] = useState<string[]>([]);
  const [primitiveData, setPrimitiveData] = useState<
    Record<string, TableData | null>
  >({});
  const [staticTableData, setStaticTableData] = useState<
    Record<string, TableData | null>
  >({});
  const [scheduledData, setScheduledData] = useState<
    Record<string, TableData | null>
  >({});
  const [contractsData, setContractsData] = useState<
    Record<string, TableData | null>
  >({});
  const [eventsData, setEventsData] = useState<
    Record<string, TableData | null>
  >({});
  const [primitivePagination, setPrimitivePagination] = useState<
    Record<string, PaginationMeta>
  >({});
  const [staticTablePagination, setStaticTablePagination] = useState<
    Record<string, PaginationMeta>
  >({});
  const [eventsPagination, setEventsPagination] = useState<
    Record<string, PaginationMeta>
  >({});
  const [primitiveSchemas, setPrimitiveSchemas] = useState<
    Record<string, SchemaColumn[]>
  >({});
  const [staticTableSchemas, setStaticTableSchemas] = useState<
    Record<string, SchemaColumn[]>
  >({});

  // Add ref to track if initial load is complete
  const isInitialLoadComplete = useRef(false);

  // Refs to access current state values in callbacks
  const primitiveNamesRef = useRef<string[]>([]);
  const primitiveSchemasRef = useRef<Record<string, SchemaColumn[]>>({});
  const staticTableSchemasRef = useRef<Record<string, SchemaColumn[]>>({});
  const primitivePaginationRef = useRef<Record<string, PaginationMeta>>({});
  const staticTablePaginationRef = useRef<Record<string, PaginationMeta>>({});
  const eventsPaginationRef = useRef<Record<string, PaginationMeta>>({});

  // Update refs whenever state changes
  useEffect(() => {
    primitiveNamesRef.current = primitiveNames;
  }, [primitiveNames]);

  useEffect(() => {
    primitiveSchemasRef.current = primitiveSchemas;
  }, [primitiveSchemas]);

  useEffect(() => {
    staticTableSchemasRef.current = staticTableSchemas;
  }, [staticTableSchemas]);

  useEffect(() => {
    primitivePaginationRef.current = primitivePagination;
  }, [primitivePagination]);

  useEffect(() => {
    staticTablePaginationRef.current = staticTablePagination;
  }, [staticTablePagination]);

  useEffect(() => {
    eventsPaginationRef.current = eventsPagination;
  }, [eventsPagination]);

  // Convert schema columns to Field format
  const convertSchemaToFields = useCallback(
    (schema: SchemaColumn[]): Field[] => {
      return schema.map((column) => ({
        name: column.column_name,
        dataTypeID: 25, // Default to text type - could be mapped from column.data_type if needed
      }));
    },
    [],
  );

  // Convert primitive data (direct array) to TableData format using schema
  const convertPrimitiveDataToTableFormat = useCallback(
    (
      primitiveData: any,
      primitiveName: string,
      schema?: SchemaColumn[],
    ): TableData | null => {
      const rows = Array.isArray(primitiveData) ? primitiveData : [];

      let fields: Field[] = [];

      if (schema && schema.length > 0) {
        // Use schema if available
        fields = convertSchemaToFields(schema);
      } else if (rows.length > 0) {
        // Fallback to extracting from first row if no schema
        fields = Object.keys(rows[0]).map((key) => ({
          name: key,
          dataTypeID: 25,
        }));
      }

      return {
        command: "SELECT",
        rowCount: rows.length,
        rows: rows,
        fields: fields,
      };
    },
    [convertSchemaToFields],
  );

  // Convert table data to TableData format using schema
  const convertTableDataToTableFormat = useCallback(
    (
      tableData: any,
      tableName: string,
      schema?: SchemaColumn[],
    ): TableData | null => {
      const rows = Array.isArray(tableData) ? tableData : [];

      let fields: Field[] = [];

      if (schema && schema.length > 0) {
        // Use schema if available
        fields = convertSchemaToFields(schema);
      } else if (rows.length > 0) {
        // Fallback to extracting from first row if no schema
        fields = Object.keys(rows[0]).map((key) => ({
          name: key,
          dataTypeID: 25,
        }));
      }

      return {
        command: "SELECT",
        rowCount: rows.length,
        rows: rows,
        fields: fields,
      };
    },
    [convertSchemaToFields],
  );

  // Convert contract data (from config) to TableData format
  const convertContractsDataToTableFormat = useCallback(
    (config: any[]): TableData | null => {
      if (!config || !Array.isArray(config)) {
        return null;
      }

      const rows: any[] = [];
      config.forEach((syncProtocolConfig) => {
        if (
          !syncProtocolConfig.primitives ||
          !Array.isArray(syncProtocolConfig.primitives)
        ) {
          return;
        }
        syncProtocolConfig.primitives.forEach((primitiveConfig: any) => {
          if (!primitiveConfig.primitive || !primitiveConfig.primitive.name) {
            console.warn(
              "Primitive config is missing primitive or primitive.name",
              primitiveConfig,
            );
            return;
          }
          rows.push({
            network_type: syncProtocolConfig.networkType || "N/A",
            primitive_name: primitiveConfig.primitive.name,
            primitive_type: primitiveConfig.primitive.type,
            contract_address: primitiveConfig.primitive.contractAddress ||
              "N/A",
            start_block: primitiveConfig.primitive.startBlockHeight ||
              "N/A",
          });
        });
      });

      const fields: Field[] = [
        { name: "network_type", dataTypeID: 25 },
        { name: "primitive_name", dataTypeID: 25 },
        { name: "primitive_type", dataTypeID: 25 },
        { name: "contract_address", dataTypeID: 25 },
        { name: "start_block", dataTypeID: 23 }, // number
      ];

      return {
        command: "SELECT",
        rowCount: rows.length,
        rows: rows,
        fields: fields,
      };
    },
    [],
  );

  // Fetch schema for primitive
  const fetchPrimitiveSchema = useCallback(
    async (primitiveName: string): Promise<SchemaColumn[] | null> => {
      try {
        const response = await fetch(
          `${PRIMITIVES_SCHEMA_ENDPOINT}/${primitiveName}`,
        );
        if (!response.ok) {
          if (response.status === 404) {
            console.log(
              `🚫 Schema for primitive ${primitiveName} not found (404)`,
            );
            return null;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const schema = await response.json();
        console.log(`📋 Fetched schema for ${primitiveName}:`, schema);
        return schema;
      } catch (error) {
        console.error(
          `Error fetching schema for primitive ${primitiveName}:`,
          error,
        );
        return null;
      }
    },
    [],
  );

  // Fetch schema for table
  const fetchTableSchema = useCallback(
    async (tableName: string): Promise<SchemaColumn[] | null> => {
      try {
        const response = await fetch(`${TABLE_SCHEMA_ENDPOINT}/${tableName}`);
        if (!response.ok) {
          if (response.status === 404) {
            console.log(`🚫 Schema for table ${tableName} not found (404)`);
            return null;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const schema = await response.json();
        console.log(`📋 Fetched schema for ${tableName}:`, schema);
        return schema;
      } catch (error) {
        console.error(`Error fetching schema for table ${tableName}:`, error);
        return null;
      }
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
          if (
            primitive.primitive &&
            primitive.primitive.name &&
            primitive.primitive.type !== "evm-rpc-paima-l2"
          ) {
            names.push(primitive.primitive.name);
          }
        });
      }
    });

    return [...new Set(names)]; // Remove duplicates
  }, []);

  // Fetch primitive data
  const fetchPrimitiveData = useCallback(
    async (
      primitiveName: string,
      schema?: SchemaColumn[],
      pagination?: PaginationMeta,
    ) => {
      try {
        const current = pagination ?? {
          limit: DEFAULT_LIMIT,
          cursors: [undefined],
          currentPage: 0,
          hasMore: false,
        };
        const url = new URL(
          `${PRIMITIVES_ENDPOINT}/${primitiveName}`,
        );
        url.searchParams.set("limit", String(current.limit));

        const cursor = current.cursors[current.currentPage];
        if (cursor) {
          url.searchParams.set("after", cursor);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
          if (response.status === 404) {
            console.log(`🚫 Primitive ${primitiveName} not found (404)`);
            return null;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const json = await response.json();
        const data = Array.isArray(json) ? json : (json.data ?? []);
        const paginationMeta = json.pagination;
        if (paginationMeta) {
          setPrimitivePagination((prev) => {
            const newCursors = [...prev[primitiveName].cursors];
            if (
              paginationMeta.nextCursor &&
              newCursors.length === prev[primitiveName].currentPage + 1
            ) {
              newCursors.push(paginationMeta.nextCursor);
            }
            return {
              ...prev,
              [primitiveName]: {
                ...prev[primitiveName],
                hasMore: paginationMeta.hasMore,
                cursors: newCursors,
              },
            };
          });
        }
        console.log(`📊 Fetched data for ${primitiveName}:`, data);

        return convertPrimitiveDataToTableFormat(data, primitiveName, schema);
      } catch (error) {
        console.error(
          `Error fetching primitive data for ${primitiveName}:`,
          error,
        );
        return null;
      }
    },
    [convertPrimitiveDataToTableFormat],
  );

  // Fetch table data
  const fetchTableData = useCallback(
    async (
      tableName: string,
      schema?: SchemaColumn[],
      pagination?: PaginationMeta,
    ) => {
      try {
        const current = pagination ?? {
          limit: DEFAULT_LIMIT,
          cursors: [undefined],
          currentPage: 0,
          hasMore: false,
        };
        const url = new URL(`${TABLES_ENDPOINT}/${tableName}`);
        url.searchParams.set("limit", String(current.limit));

        const cursor = current.cursors[current.currentPage];
        if (cursor) {
          url.searchParams.set("after", cursor);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
          if (response.status === 404) {
            console.log(`🚫 Table ${tableName} not found (404)`);
            return null;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonResponse = await response.json();
        console.log(`📊 Fetched table data for ${tableName}:`, jsonResponse);
        const data = jsonResponse.data ?? [];
        const paginationMeta = jsonResponse.pagination;
        if (paginationMeta) {
          setStaticTablePagination((prev) => {
            const newCursors = [...prev[tableName].cursors];
            if (
              paginationMeta.nextCursor &&
              newCursors.length === prev[tableName].currentPage + 1
            ) {
              newCursors.push(paginationMeta.nextCursor);
            }
            return {
              ...prev,
              [tableName]: {
                ...prev[tableName],
                hasMore: paginationMeta.hasMore,
                cursors: newCursors,
              },
            };
          });
        }

        return convertTableDataToTableFormat(data, tableName, schema);
      } catch (error) {
        console.error(`Error fetching table data for ${tableName}:`, error);
        return null;
      }
    },
    [convertTableDataToTableFormat],
  );

  // Fetch events data
  const fetchEventsData = useCallback(
    async (pagination?: PaginationMeta) => {
      try {
        const current = pagination ?? {
          limit: DEFAULT_LIMIT,
          cursors: [undefined],
          currentPage: 0,
          hasMore: false,
        };
        const url = new URL(EVENTS_ENDPOINT);
        url.searchParams.set("limit", String(current.limit));

        const cursor = current.cursors[current.currentPage];
        if (cursor) {
          url.searchParams.set("after", cursor);
        }

        const response = await fetch(url.toString());
        if (!response.ok) {
          if (response.status === 404) {
            console.log(`🚫 Events not found (404)`);
            return null;
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonResponse = await response.json();
        console.log(`📊 Fetched events data:`, jsonResponse);
        const data = jsonResponse.data ?? [];
        const paginationMeta = jsonResponse.pagination;
        if (paginationMeta) {
          setEventsPagination((prev) => {
            const newCursors = [...prev["events"].cursors];
            if (
              paginationMeta.nextCursor &&
              newCursors.length === prev["events"].currentPage + 1
            ) {
              newCursors.push(paginationMeta.nextCursor);
            }
            return {
              ...prev,
              ["events"]: {
                ...prev["events"],
                hasMore: paginationMeta.hasMore,
                cursors: newCursors,
              },
            };
          });
        }

        // Manually define fields for events data
        const fields: Field[] = [
          { name: "id", dataTypeID: 23 },
          { name: "event_name", dataTypeID: 25 },
          { name: "topic", dataTypeID: 25 },
          { name: "address", dataTypeID: 25 },
          { name: "data", dataTypeID: 25 },
          { name: "block_height", dataTypeID: 23 },
          { name: "tx_index", dataTypeID: 23 },
          { name: "log_index", dataTypeID: 23 },
        ];

        return {
          command: "SELECT",
          rowCount: data.length,
          rows: data,
          fields: fields,
        };
      } catch (error) {
        console.error(`Error fetching events data:`, error);
        return null;
      }
    },
    [],
  );

  // Fetch scheduled data
  const fetchScheduledData = useCallback(
    async (): Promise<TableData | null> => {
      try {
        const response = await fetch(SCHEDULED_DATA_ENDPOINT);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonResponse = await response.json();
        const data: IGetAllScheduledDataResult[] = jsonResponse.data ?? [];
        console.log("📊 Fetched scheduled data:", data);

        // Convert to TableData format
        const fields = [
          { name: "id", dataTypeID: 23 },
          { name: "from_address", dataTypeID: 25 },
          { name: "input_data", dataTypeID: 25 },
          { name: "primitive_name", dataTypeID: 25 },
          { name: "caip2", dataTypeID: 25 },
          { name: "contract_address", dataTypeID: 25 },
          { name: "origin_tx_hash", dataTypeID: 25 },
          { name: "future_block_height", dataTypeID: 23 },
          { name: "future_ms_timestamp", dataTypeID: 25 },
        ];

        return {
          command: "SELECT",
          rowCount: data.length,
          rows: data,
          fields: fields,
        };
      } catch (error) {
        console.error("Error fetching scheduled data:", error);
        return null;
      }
    },
    [],
  );

  // Refresh primitive data
  const refreshPrimitiveData = useCallback(async () => {
    // Only refresh if we have primitive names and initial load is complete
    if (
      primitiveNamesRef.current.length === 0 || !isInitialLoadComplete.current
    ) {
      return;
    }

    try {
      const fetchPromises = primitiveNamesRef.current.map(
        async (primitiveName) => {
          const schema = primitiveSchemasRef.current[primitiveName];
          const pagination = primitivePaginationRef.current[primitiveName];
          const data = await fetchPrimitiveData(
            primitiveName,
            schema,
            pagination,
          );
          return { primitiveName, data };
        },
      );

      const results = await Promise.all(fetchPromises);

      // Only update data if we got results, preserve existing data
      if (results.length > 0) {
        setPrimitiveData((currentData) => {
          const updatedData = { ...currentData };
          results.forEach(({ primitiveName, data }) => {
            // Only update if we got valid data, otherwise keep existing data
            if (data !== null) {
              updatedData[primitiveName] = data;
            }
          });
          return updatedData;
        });
      }
    } catch (error) {
      console.error("Error refreshing primitive data:", error);
      // Don't clear data on error, keep existing data
    }
  }, [fetchPrimitiveData]);

  // Refresh static table data
  const refreshStaticTableData = useCallback(async () => {
    // Only refresh if initial load is complete
    if (!isInitialLoadComplete.current) {
      return;
    }

    try {
      const tableName = "user_state_machine";
      const schema = staticTableSchemasRef.current[tableName];
      const pagination = staticTablePaginationRef.current[tableName];
      const data = await fetchTableData(tableName, schema, pagination);
      // Only update if we got valid data
      if (data !== null) {
        setStaticTableData({ [tableName]: data });
      }
    } catch (error) {
      console.error("Error refreshing static table data:", error);
      // Don't clear data on error, keep existing data
    }
  }, [fetchTableData]);

  // Refresh scheduled data
  const refreshScheduledData = useCallback(async () => {
    // Only refresh if initial load is complete
    if (!isInitialLoadComplete.current) {
      return;
    }

    try {
      const data = await fetchScheduledData();
      // Only update if we got valid data
      if (data !== null) {
        setScheduledData({ "scheduled_data": data });
      }
    } catch (error) {
      console.error("Error refreshing scheduled data:", error);
      // Don't clear data on error, keep existing data
    }
  }, [fetchScheduledData]);

  // Refresh events data
  const refreshEventsData = useCallback(async () => {
    if (!isInitialLoadComplete.current) {
      return;
    }

    try {
      const pagination = eventsPaginationRef.current["events"];
      const data = await fetchEventsData(pagination);
      if (data !== null) {
        setEventsData({ "events": data });
      }
    } catch (error) {
      console.error("Error refreshing events data:", error);
    }
  }, [fetchEventsData]);

  // Initialize primitive tables
  const initializePrimitiveTables = useCallback(async () => {
    console.log("📋 Initializing primitive tables...");

    try {
      // Fetch configuration
      const config = await fetchConfig();
      if (!config) {
        console.error("Failed to fetch config");
        return;
      }

      // Extract primitive names
      const names = extractPrimitiveNames(config);
      setPrimitiveNames(names);
      console.log("📊 Found primitives:", names);

      if (names.length === 0) {
        console.log("No primitives found in config");
        return;
      }

      // Fetch schemas first
      const schemaPromises = names.map(async (primitiveName) => {
        const schema = await fetchPrimitiveSchema(primitiveName);
        return { primitiveName, schema };
      });

      const schemaResults = await Promise.all(schemaPromises);

      // Store schemas
      const schemas: Record<string, SchemaColumn[]> = {};
      schemaResults.forEach(({ primitiveName, schema }) => {
        if (schema) {
          schemas[primitiveName] = schema;
        }
      });
      setPrimitiveSchemas(schemas);

      // Initialize pagination defaults for each primitive
      setPrimitivePagination((prev) => {
        const next = { ...prev };
        names.forEach((name) => {
          if (!next[name]) {
            next[name] = {
              limit: DEFAULT_LIMIT,
              cursors: [undefined],
              currentPage: 0,
              hasMore: false,
            };
          }
        });
        return next;
      });

      // Fetch data for each primitive
      const fetchPromises = names.map(async (primitiveName) => {
        const schema = schemas[primitiveName];
        const pagination = primitivePaginationRef.current[primitiveName] ?? {
          limit: DEFAULT_LIMIT,
          cursors: [undefined],
          currentPage: 0,
          hasMore: false,
        };
        const data = await fetchPrimitiveData(
          primitiveName,
          schema,
          pagination,
        );
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
    }
  }, [
    fetchConfig,
    extractPrimitiveNames,
    fetchPrimitiveSchema,
    fetchPrimitiveData,
  ]);

  // Initialize static tables
  const initializeStaticTables = useCallback(async () => {
    console.log("📋 Initializing state machine tables...");

    try {
      // Fetch schema first
      const schema = await fetchTableSchema("user_state_machine");
      if (schema) {
        setStaticTableSchemas({ "user_state_machine": schema });
      }

      // Initialize pagination defaults
      setStaticTablePagination((prev) => ({
        ...prev,
        ["user_state_machine"]: prev["user_state_machine"] ?? {
          limit: DEFAULT_LIMIT,
          cursors: [undefined],
          currentPage: 0,
          hasMore: false,
        },
      }));

      // Then fetch data
      const tableName = "user_state_machine";
      const pagination = staticTablePaginationRef.current[tableName] ?? {
        limit: DEFAULT_LIMIT,
        cursors: [undefined],
        currentPage: 0,
        hasMore: false,
      };
      const data = await fetchTableData(
        tableName,
        schema || undefined,
        pagination,
      );
      setStaticTableData({ [tableName]: data });
      console.log("✅ State machine tables initialized");
    } catch (error) {
      console.error("Error initializing state machine tables:", error);
    }
  }, [fetchTableSchema, fetchTableData]);

  // Initialize scheduled data
  const initializeScheduledData = useCallback(async () => {
    console.log("📋 Initializing scheduled data...");

    try {
      const data = await fetchScheduledData();
      setScheduledData({ "scheduled_data": data });
      console.log("✅ Scheduled data initialized");
    } catch (error) {
      console.error("Error initializing scheduled data:", error);
    }
  }, [fetchScheduledData]);

  const initializeEventsData = useCallback(async () => {
    console.log("📋 Initializing events data...");

    try {
      setEventsPagination((prev) => ({
        ...prev,
        ["events"]: prev["events"] ?? {
          limit: DEFAULT_LIMIT,
          cursors: [undefined],
          currentPage: 0,
          hasMore: false,
        },
      }));

      const pagination = eventsPaginationRef.current["events"] ?? {
        limit: DEFAULT_LIMIT,
        cursors: [undefined],
        currentPage: 0,
        hasMore: false,
      };
      const data = await fetchEventsData(pagination);
      setEventsData({ "events": data });
      console.log("✅ Events data initialized");
    } catch (error) {
      console.error("Error initializing events data:", error);
    }
  }, [fetchEventsData]);

  // Initialize contracts data
  const initializeContractsData = useCallback(async () => {
    console.log("📋 Initializing contracts data...");

    try {
      const config = await fetchConfig();
      if (!config) {
        console.error("Failed to fetch config for contracts data");
        return;
      }

      const tableData = convertContractsDataToTableFormat(config);
      setContractsData({ "contracts": tableData });
      console.log("✅ Contracts data initialized");
    } catch (error) {
      console.error("Error initializing contracts data:", error);
    }
  }, [fetchConfig, convertContractsDataToTableFormat]);

  // Initialize and setup refresh intervals
  useEffect(() => {
    let primitiveRefreshInterval: number;
    let staticTableRefreshInterval: number;
    let scheduledDataRefreshInterval: number;
    let eventsRefreshInterval: number;

    const initialize = async () => {
      // Initialize tables
      await Promise.all([
        initializePrimitiveTables(),
        initializeStaticTables(),
        initializeScheduledData(),
        initializeContractsData(),
        initializeEventsData(),
      ]);

      // Mark initial load as complete
      isInitialLoadComplete.current = true;

      // Setup staggered refresh intervals to distribute server load
      // Refresh primitive data immediately, then every 5 seconds
      primitiveRefreshInterval = setInterval(() => {
        refreshPrimitiveData();
      }, 5000);

      // Refresh static table data after 1.5 seconds, then every 5 seconds
      setTimeout(() => {
        refreshStaticTableData();
        staticTableRefreshInterval = setInterval(() => {
          refreshStaticTableData();
        }, 5000);
      }, 1500);

      // Refresh scheduled data after 3 seconds, then every 5 seconds
      setTimeout(() => {
        refreshScheduledData();
        scheduledDataRefreshInterval = setInterval(() => {
          refreshScheduledData();
        }, 5000);
      }, 3000);

      // Refresh events data after 4.5 seconds, then every 5 seconds
      setTimeout(() => {
        refreshEventsData();
        eventsRefreshInterval = setInterval(() => {
          refreshEventsData();
        }, 5000);
      }, 4500);
    };

    initialize();

    return () => {
      if (primitiveRefreshInterval) {
        clearInterval(primitiveRefreshInterval);
      }
      if (staticTableRefreshInterval) {
        clearInterval(staticTableRefreshInterval);
      }
      if (scheduledDataRefreshInterval) {
        clearInterval(scheduledDataRefreshInterval);
      }
      if (eventsRefreshInterval) {
        clearInterval(eventsRefreshInterval);
      }
    };
  }, []); // Empty dependency array to prevent re-runs

  return {
    primitiveData,
    staticTableData,
    scheduledData,
    contractsData,
    eventsData,
    refreshPrimitiveData,
    refreshStaticTableData,
    refreshScheduledData,
    primitivePagination,
    staticTablePagination,
    eventsPagination,
    // Pagination controls for primitives
    setPrimitiveLimit: async (primitiveName: string, limit: number) => {
      const newPagination = {
        limit,
        cursors: [undefined],
        currentPage: 0,
        hasMore: false,
      };
      setPrimitivePagination((prev) => ({
        ...prev,
        [primitiveName]: newPagination,
      }));
      const schema = primitiveSchemasRef.current[primitiveName];
      const data = await fetchPrimitiveData(
        primitiveName,
        schema,
        newPagination,
      );
      setPrimitiveData((prev) => ({ ...prev, [primitiveName]: data }));
    },
    nextPrimitivePage: async (primitiveName: string) => {
      const current = primitivePaginationRef.current[primitiveName];
      if (!current || !current.hasMore) return;

      const newPagination = {
        ...current,
        currentPage: current.currentPage + 1,
      };
      setPrimitivePagination((prev) => ({
        ...prev,
        [primitiveName]: newPagination,
      }));
      const schema = primitiveSchemasRef.current[primitiveName];
      const data = await fetchPrimitiveData(
        primitiveName,
        schema,
        newPagination,
      );
      setPrimitiveData((prev) => ({ ...prev, [primitiveName]: data }));
    },
    prevPrimitivePage: async (primitiveName: string) => {
      const current = primitivePaginationRef.current[primitiveName];
      if (!current || current.currentPage === 0) return;

      const newPagination = {
        ...current,
        currentPage: current.currentPage - 1,
      };
      setPrimitivePagination((prev) => ({
        ...prev,
        [primitiveName]: newPagination,
      }));
      const schema = primitiveSchemasRef.current[primitiveName];
      const data = await fetchPrimitiveData(
        primitiveName,
        schema,
        newPagination,
      );
      setPrimitiveData((prev) => ({ ...prev, [primitiveName]: data }));
    },
    firstPrimitivePage: async (primitiveName: string) => {
      const current = primitivePaginationRef.current[primitiveName];
      if (!current) return;

      const newPagination = {
        ...current,
        cursors: [undefined],
        currentPage: 0,
      };
      setPrimitivePagination((prev) => ({
        ...prev,
        [primitiveName]: newPagination,
      }));
      const schema = primitiveSchemasRef.current[primitiveName];
      const data = await fetchPrimitiveData(
        primitiveName,
        schema,
        newPagination,
      );
      setPrimitiveData((prev) => ({ ...prev, [primitiveName]: data }));
    },
    // Pagination controls for static tables
    setStaticTableLimit: async (tableName: string, limit: number) => {
      const newPagination = {
        limit,
        cursors: [undefined],
        currentPage: 0,
        hasMore: false,
      };
      setStaticTablePagination((prev) => ({
        ...prev,
        [tableName]: newPagination,
      }));
      const schema = staticTableSchemasRef.current[tableName];
      const data = await fetchTableData(tableName, schema, newPagination);
      setStaticTableData((prev) => ({ ...prev, [tableName]: data }));
    },
    nextStaticTablePage: async (tableName: string) => {
      const current = staticTablePaginationRef.current[tableName];
      if (!current || !current.hasMore) return;

      const newPagination = {
        ...current,
        currentPage: current.currentPage + 1,
      };
      setStaticTablePagination((prev) => ({
        ...prev,
        [tableName]: newPagination,
      }));
      const schema = staticTableSchemasRef.current[tableName];
      const data = await fetchTableData(tableName, schema, newPagination);
      setStaticTableData((prev) => ({ ...prev, [tableName]: data }));
    },
    prevStaticTablePage: async (tableName: string) => {
      const current = staticTablePaginationRef.current[tableName];
      if (!current || current.currentPage === 0) return;

      const newPagination = {
        ...current,
        currentPage: current.currentPage - 1,
      };
      setStaticTablePagination((prev) => ({
        ...prev,
        [tableName]: newPagination,
      }));
      const schema = staticTableSchemasRef.current[tableName];
      const data = await fetchTableData(tableName, schema, newPagination);
      setStaticTableData((prev) => ({ ...prev, [tableName]: data }));
    },
    firstStaticTablePage: async (tableName: string) => {
      const current = staticTablePaginationRef.current[tableName];
      if (!current) return;

      const newPagination = {
        ...current,
        cursors: [undefined],
        currentPage: 0,
      };
      setStaticTablePagination((prev) => ({
        ...prev,
        [tableName]: newPagination,
      }));
      const schema = staticTableSchemasRef.current[tableName];
      const data = await fetchTableData(tableName, schema, newPagination);
      setStaticTableData((prev) => ({ ...prev, [tableName]: data }));
    },
  };
}
