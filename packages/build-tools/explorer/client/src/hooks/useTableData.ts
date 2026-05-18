import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONFIG_ENDPOINT,
  explorerFetch,
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
  const [userTableNames, setUserTableNames] = useState<string[]>([]);
  const [primitiveData, setPrimitiveData] = useState<
    Record<string, TableData | null>
  >({});
  const [userTableData, setUserTableData] = useState<
    Record<string, TableData | null>
  >({});
  const [scheduledData, setScheduledData] = useState<
    Record<string, TableData | null>
  >({});
  const [primitivePagination, setPrimitivePagination] = useState<
    Record<string, PaginationMeta>
  >({});
  const [userTablePagination, setUserTablePagination] = useState<
    Record<string, PaginationMeta>
  >({});
  const [primitiveSchemas, setPrimitiveSchemas] = useState<
    Record<string, SchemaColumn[]>
  >({});
  const [userTableSchemas, setUserTableSchemas] = useState<
    Record<string, SchemaColumn[]>
  >({});

  // Add ref to track if initial load is complete
  const isInitialLoadComplete = useRef(false);

  // Refs to access current state values in callbacks
  const primitiveNamesRef = useRef<string[]>([]);
  const userTableNamesRef = useRef<string[]>([]);
  const primitiveSchemasRef = useRef<Record<string, SchemaColumn[]>>({});
  const userTableSchemasRef = useRef<Record<string, SchemaColumn[]>>({});
  const primitivePaginationRef = useRef<Record<string, PaginationMeta>>({});
  const userTablePaginationRef = useRef<Record<string, PaginationMeta>>({});

  // Cache primitives whose schema 404s so we never re-request
  const unavailablePrimitiveSchemasRef = useRef<Set<string>>(new Set());
  // Cache primitives whose data 404s so we never re-request
  const unavailablePrimitiveDataRef = useRef<Set<string>>(new Set());

  // Update refs whenever state changes
  useEffect(() => {
    primitiveNamesRef.current = primitiveNames;
  }, [primitiveNames]);

  useEffect(() => {
    userTableNamesRef.current = userTableNames;
  }, [userTableNames]);

  useEffect(() => {
    primitiveSchemasRef.current = primitiveSchemas;
  }, [primitiveSchemas]);

  useEffect(() => {
    userTableSchemasRef.current = userTableSchemas;
  }, [userTableSchemas]);

  useEffect(() => {
    primitivePaginationRef.current = primitivePagination;
  }, [primitivePagination]);

  useEffect(() => {
    userTablePaginationRef.current = userTablePagination;
  }, [userTablePagination]);

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

  // Fetch schema for primitive
  const fetchPrimitiveSchema = useCallback(
    async (primitiveName: string): Promise<SchemaColumn[] | null> => {
      try {
        // Short-circuit if we already know this primitive has no aggregated data
        if (unavailablePrimitiveSchemasRef.current.has(primitiveName)) {
          return null;
        }

        // Return cached schema if already fetched
        const cached = primitiveSchemasRef.current[primitiveName];
        if (cached) {
          return cached;
        }

        const response = await explorerFetch(
          `${PRIMITIVES_SCHEMA_ENDPOINT}/${primitiveName}`,
        );
        if (!response.ok) {
          if (response.status === 404) {
            console.log(
              `🚫 Schema for primitive ${primitiveName} not found (404)`,
            );
            // Mark as permanently unavailable for this session
            unavailablePrimitiveSchemasRef.current.add(primitiveName);
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
        const response = await explorerFetch(`${TABLE_SCHEMA_ENDPOINT}/${tableName}`);
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

  // Fetch all user table names
  const fetchAllUserTableNames = useCallback(async (): Promise<string[]> => {
    try {
      const response = await explorerFetch(TABLES_ENDPOINT);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const tables: { table_name: string }[] = await response.json();
      console.log("📋 Fetched user table names:", tables);
      return tables.map((t) => t.table_name);
    } catch (error) {
      console.error("Error fetching user table names:", error);
      return [];
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
            primitive.primitive.type !== "evm-rpc-effectstream-l2"
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
        // Short-circuit if we already know this primitive has no aggregated data
        if (unavailablePrimitiveDataRef.current.has(primitiveName)) {
          return null;
        }

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

        const response = await explorerFetch(url.toString());
        if (!response.ok) {
          if (response.status === 404) {
            console.log(`🚫 Primitive ${primitiveName} not found (404)`);
            // Mark as permanently unavailable for this session
            unavailablePrimitiveDataRef.current.add(primitiveName);
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

        const response = await explorerFetch(url.toString());
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
          setUserTablePagination((prev) => {
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

  // Fetch scheduled data
  const fetchScheduledData = useCallback(
    async (): Promise<TableData | null> => {
      try {
        const response = await explorerFetch(SCHEDULED_DATA_ENDPOINT);
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
  const refreshUserTableData = useCallback(async () => {
    // Only refresh if initial load is complete
    if (
      !isInitialLoadComplete.current || userTableNamesRef.current.length === 0
    ) {
      return;
    }

    try {
      const fetchPromises = userTableNamesRef.current.map(
        async (tableName) => {
          const schema = userTableSchemasRef.current[tableName];
          const pagination = userTablePaginationRef.current[tableName];
          const data = await fetchTableData(tableName, schema, pagination);
          return { tableName, data };
        },
      );

      const results = await Promise.all(fetchPromises);

      if (results.length > 0) {
        setUserTableData((currentData) => {
          const updatedData = { ...currentData };
          results.forEach(({ tableName, data }) => {
            if (data !== null) {
              updatedData[tableName] = data;
            }
          });
          return updatedData;
        });
      }
    } catch (error) {
      console.error("Error refreshing user table data:", error);
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
  const initializeUserTables = useCallback(async () => {
    console.log("📋 Initializing state machine tables...");

    try {
      const tableNames = await fetchAllUserTableNames();
      setUserTableNames(tableNames);

      if (tableNames.length === 0) {
        console.log("No user tables found");
        return;
      }

      // Fetch schemas first
      const schemaPromises = tableNames.map(async (tableName) => {
        const schema = await fetchTableSchema(tableName);
        return { tableName, schema };
      });

      const schemaResults = await Promise.all(schemaPromises);

      // Store schemas
      const schemas: Record<string, SchemaColumn[]> = {};
      schemaResults.forEach(({ tableName, schema }) => {
        if (schema) {
          schemas[tableName] = schema;
        }
      });
      setUserTableSchemas(schemas);

      // Initialize pagination defaults
      setUserTablePagination((prev) => {
        const next = { ...prev };
        tableNames.forEach((name) => {
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

      // Then fetch data
      const fetchPromises = tableNames.map(
        async (tableName) => {
          const schema = schemas[tableName];
          const pagination = userTablePaginationRef.current[tableName] ?? {
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
          return { tableName, data };
        },
      );

      const results = await Promise.all(fetchPromises);

      const initialData: Record<string, TableData | null> = {};
      results.forEach(({ tableName, data }) => {
        initialData[tableName] = data;
      });

      setUserTableData(initialData);
      console.log("✅ State machine tables initialized");
    } catch (error) {
      console.error("Error initializing state machine tables:", error);
    }
  }, [fetchTableSchema, fetchTableData, fetchAllUserTableNames]);

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

  // Initialize and setup refresh intervals
  useEffect(() => {
    let primitiveRefreshInterval: ReturnType<typeof setInterval>;
    let userTableRefreshInterval: ReturnType<typeof setInterval>;
    let scheduledDataRefreshInterval: ReturnType<typeof setInterval>;

    const initialize = async () => {
      // Initialize tables
      await Promise.all([
        initializePrimitiveTables(),
        initializeUserTables(),
        initializeScheduledData(),
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
        refreshUserTableData();
        userTableRefreshInterval = setInterval(() => {
          refreshUserTableData();
        }, 5000);
      }, 1500);

      // Refresh scheduled data after 3 seconds, then every 5 seconds
      setTimeout(() => {
        refreshScheduledData();
        scheduledDataRefreshInterval = setInterval(() => {
          refreshScheduledData();
        }, 5000);
      }, 3000);
    };

    initialize();

    return () => {
      if (primitiveRefreshInterval) {
        clearInterval(primitiveRefreshInterval);
      }
      if (userTableRefreshInterval) {
        clearInterval(userTableRefreshInterval);
      }
      if (scheduledDataRefreshInterval) {
        clearInterval(scheduledDataRefreshInterval);
      }
    };
  }, []); // Empty dependency array to prevent re-runs

  return {
    primitiveData,
    userTableData,
    scheduledData,
    primitiveNames,
    userTableNames,
    refreshPrimitiveData,
    refreshUserTableData,
    refreshScheduledData,
    primitivePagination,
    userTablePagination,
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
    setUserTableLimit: async (tableName: string, limit: number) => {
      const newPagination = {
        limit,
        cursors: [undefined],
        currentPage: 0,
        hasMore: false,
      };
      setUserTablePagination((prev) => ({
        ...prev,
        [tableName]: newPagination,
      }));
      const schema = userTableSchemasRef.current[tableName];
      const data = await fetchTableData(tableName, schema, newPagination);
      setUserTableData((prev) => ({ ...prev, [tableName]: data }));
    },
    nextUserTablePage: async (tableName: string) => {
      const current = userTablePaginationRef.current[tableName];
      if (!current || !current.hasMore) return;

      const newPagination = {
        ...current,
        currentPage: current.currentPage + 1,
      };
      setUserTablePagination((prev) => ({
        ...prev,
        [tableName]: newPagination,
      }));
      const schema = userTableSchemasRef.current[tableName];
      const data = await fetchTableData(tableName, schema, newPagination);
      setUserTableData((prev) => ({ ...prev, [tableName]: data }));
    },
    prevUserTablePage: async (tableName: string) => {
      const current = userTablePaginationRef.current[tableName];
      if (!current || current.currentPage === 0) return;

      const newPagination = {
        ...current,
        currentPage: current.currentPage - 1,
      };
      setUserTablePagination((prev) => ({
        ...prev,
        [tableName]: newPagination,
      }));
      const schema = userTableSchemasRef.current[tableName];
      const data = await fetchTableData(tableName, schema, newPagination);
      setUserTableData((prev) => ({ ...prev, [tableName]: data }));
    },
    firstUserTablePage: async (tableName: string) => {
      const current = userTablePaginationRef.current[tableName];
      if (!current) return;

      const newPagination = {
        ...current,
        cursors: [undefined],
        currentPage: 0,
      };
      setUserTablePagination((prev) => ({
        ...prev,
        [tableName]: newPagination,
      }));
      const schema = userTableSchemasRef.current[tableName];
      const data = await fetchTableData(tableName, schema, newPagination);
      setUserTableData((prev) => ({ ...prev, [tableName]: data }));
    },
  };
}
