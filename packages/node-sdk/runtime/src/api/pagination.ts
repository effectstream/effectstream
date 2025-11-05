import { type Static, type TSchema, Type } from "@sinclair/typebox";
import type { Pool } from "pg";
import {
  getDynamicTables,
  getPrimaryKeyColumns,
  getPublicTables,
  getTableSchema,
  type IGetDynamicTablesResult,
  type IGetPrimaryKeyColumnsResult,
  type IGetPublicTablesResult,
  type IGetTableSchemaResult,
  runPreparedQuery,
} from "@effectstream/db";
import { decodeBase64, encodeBase64 } from "@std/encoding/base64";

// Utility functions for SQL injection prevention
export function validateColumnName(columnName: string): boolean {
  // Only allow alphanumeric characters, underscores, and ensure reasonable length
  const columnRegex = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
  return columnRegex.test(columnName);
}

export function validateCursorStructure<T extends Record<string, any>>(
  cursor: any,
  expectedFields: (keyof T)[],
): boolean {
  if (!cursor || typeof cursor !== "object") {
    return false;
  }

  const cursorKeys = Object.keys(cursor);
  const expectedKeys = expectedFields.map((f) => String(f));

  // Check that cursor contains exactly the expected fields
  if (cursorKeys.length !== expectedKeys.length) {
    return false;
  }

  // Check that all expected fields are present and no extra fields exist
  for (const expectedKey of expectedKeys) {
    if (!cursorKeys.includes(expectedKey)) {
      return false;
    }

    // Validate column name format
    if (!validateColumnName(expectedKey)) {
      return false;
    }
  }

  return true;
}

// Utility functions for SQL injection prevention
export function escapeColumnName(columnName: string): string {
  // Double-quote column names to prevent SQL injection
  return `"${columnName.replace(/"/g, '""')}"`;
}

export function validateAndEscapeColumnName(columnName: string): string {
  if (!validateColumnName(columnName)) {
    throw new Error(`Invalid column name: ${columnName}`);
  }
  return escapeColumnName(columnName);
}

export async function fetchPublicTablePage(
  dbConn: Pool,
  safeTableName: string,
  {
    limit,
    after,
    offset,
  }: { limit: number; after?: Record<string, any>; offset?: number },
): Promise<PaginatedResponse<any>> {
  // Validate table exists
  const publicTables = await runPreparedQuery<IGetPublicTablesResult>(
    getPublicTables.run(undefined, dbConn),
    "getPublicTables",
  );
  if (!publicTables.some((t) => t.table_name === safeTableName)) {
    throw new Error(
      `Invalid table name, not found in public schema: ${safeTableName}`,
    );
  }

  // Introspect primary keys
  const pkColumnsResult = await runPreparedQuery<IGetPrimaryKeyColumnsResult>(
    getPrimaryKeyColumns.run({ tableName: `public.${safeTableName}` }, dbConn),
    "getPrimaryKeyColumns",
  );
  const pkColumns = pkColumnsResult
    .map((c) => c.column_name)
    .filter((c): c is string => c !== null);

  let query: string;
  const params: (string | number)[] = [];
  let cursorFields: string[] = [];

  if (pkColumns.length > 0) {
    // Keyset pagination
    cursorFields = pkColumns;

    // Validate cursor structure matches PKs
    if (after) {
      const cursorKeys = Object.keys(after);
      const missingKeys = pkColumns.filter((pk) => !cursorKeys.includes(pk));
      const extraKeys = cursorKeys.filter((k) => !pkColumns.includes(k));
      if (missingKeys.length > 0 || extraKeys.length > 0) {
        throw new Error(
          `Cursor must contain exactly the primary key columns: ${
            pkColumns.join(", ")
          }`,
        );
      }
    }

    let whereClause = "";
    const escapedColumns: string[] = pkColumns.map((c) =>
      validateAndEscapeColumnName(c)
    );
    const orderByClause = `ORDER BY ${
      escapedColumns.map((c) => `${c} ASC`).join(", ")
    }`;

    if (after) {
      const pkValues = pkColumns.map((c: string) => (after as any)[c]);
      const placeholders = pkColumns.map((_, i: number) => `$${i + 2}`).join(
        ", ",
      );
      whereClause = `WHERE (${escapedColumns.join(", ")}) > (${placeholders})`;
      params.push(...pkValues);
    }

    query =
      `SELECT * FROM public.${safeTableName} ${whereClause} ${orderByClause} LIMIT $1`;
    params.unshift(limit + 1);
  } else {
    // Offset pagination fallback
    // console.warn(`[Paima Engine] WARNING: Table "${safeTableName}" has no primary key. Falling back to OFFSET-based pagination.`);

    const paginationOffset = offset ?? 0;

    // Find a column to order by
    const tableSchema = await runPreparedQuery<IGetTableSchemaResult>(
      getTableSchema.run({ tableName: safeTableName }, dbConn),
      "table-schema",
    );
    if (tableSchema.length === 0) {
      throw new Error("Table has no columns or does not exist");
    }

    // Validate order-by column
    const orderByColumn = tableSchema[0].column_name;
    if (!orderByColumn) {
      throw new Error("Table has no valid column for ordering");
    }
    const escapedOrderByColumn: string = validateAndEscapeColumnName(
      orderByColumn,
    );
    const orderByClause = `ORDER BY ${escapedOrderByColumn} ASC`;
    query =
      `SELECT * FROM public.${safeTableName} ${orderByClause} LIMIT $1 OFFSET $2`;
    params.push(limit + 1, paginationOffset);
    // Build numeric nextCursor for offset mode (not base64 JSON)
    const data = await runPreparedQuery<any[]>(
      new Promise<any[]>((resolve, reject) => {
        return dbConn.query(
          query,
          params,
          (err: any, result: { rows: any[] }) => {
            if (err) reject(err);
            resolve(result.rows);
          },
        );
      }),
      `http-server/tables:${safeTableName}/${query}/${params}`,
    );

    const hasMore = data.length > limit;
    if (hasMore) data.pop();
    return {
      data,
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore ? String(paginationOffset + limit) : undefined,
      },
    };
  }

  const data = await runPreparedQuery<any[]>(
    new Promise<any[]>((resolve, reject) => {
      return dbConn.query(
        query,
        params,
        (err: any, result: { rows: any[] }) => {
          if (err) reject(err);
          resolve(result.rows);
        },
      );
    }),
    `http-server/tables:${safeTableName}/${query}/${params}`,
  );

  const pagination = createPaginationMeta<any>(
    limit,
    data,
    cursorFields as (keyof any)[],
  );
  return { data, pagination };
}

export async function fetchPrimitiveTablePage(
  dbConn: Pool,
  safeTableName: string,
  { limit, after, offset }: {
    limit: number;
    after?: Record<string, any>;
    offset?: number;
  },
): Promise<PaginatedResponse<any>> {
  // Validate primitive table exists
  const dynamicTables = await runPreparedQuery<IGetDynamicTablesResult>(
    getDynamicTables.run(undefined, dbConn),
    "getDynamicTables",
  );
  if (!dynamicTables.some((t) => t.table_name === safeTableName)) {
    throw new Error(`Table not found: ${safeTableName}`);
  }

  // Inspect schema to decide strategy
  const tableSchema = await runPreparedQuery<IGetTableSchemaResult>(
    getTableSchema.run({ tableName: safeTableName }, dbConn),
    `primitive-schema:${safeTableName}`,
  );
  if (tableSchema.length === 0) {
    throw new Error("Primitive table has no columns or does not exist");
  }
  const hasIdColumn = tableSchema.some((c) => c.column_name === "id");

  if (hasIdColumn) {
    // Keyset pagination on id
    let query: string;
    let params: (string | number)[];
    if (after) {
      const afterId = (after as any)["id"];
      if (afterId === undefined) {
        throw new Error("Cursor must contain 'id' when paginating primitives");
      }
      query =
        `SELECT * FROM primitives.${safeTableName} WHERE "id" > $1 ORDER BY "id" ASC LIMIT $2`;
      params = [afterId, limit + 1];
    } else {
      query =
        `SELECT * FROM primitives.${safeTableName} ORDER BY "id" ASC LIMIT $1`;
      params = [limit + 1];
    }

    const data = await runPreparedQuery<any[]>(
      new Promise<any[]>((resolve, reject) => {
        return dbConn.query(
          query,
          params,
          (err: any, result: { rows: any[] }) => {
            if (err) reject(err);
            resolve(result.rows);
          },
        );
      }),
      `http-server/primitives:${safeTableName}/${query}/${params}`,
    );
    const pagination = createPaginationMeta<any>(
      limit,
      data,
      ["id"] as (keyof any)[],
    );
    return { data, pagination };
  } else {
    // Fallback to offset-based pagination with numeric nextCursor
    const paginationOffset = offset ?? 0;
    const orderByColumn = tableSchema[0].column_name;
    if (!orderByColumn) {
      throw new Error("Primitive table has no valid column for ordering");
    }
    const escapedOrderByColumn = validateAndEscapeColumnName(orderByColumn);
    const query =
      `SELECT * FROM primitives.${safeTableName} ORDER BY ${escapedOrderByColumn} ASC LIMIT $1 OFFSET $2`;
    const params = [limit + 1, paginationOffset];
    const data = await runPreparedQuery<any[]>(
      new Promise<any[]>((resolve, reject) => {
        return dbConn.query(
          query,
          params,
          (err: any, result: { rows: any[] }) => {
            if (err) reject(err);
            resolve(result.rows);
          },
        );
      }),
      `http-server/primitives:${safeTableName}/${query}/${params}`,
    );
    const hasMore = data.length > limit;
    if (hasMore) data.pop();
    return {
      data,
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore ? String(paginationOffset + limit) : undefined,
      },
    };
  }
}

const DEFAULT_PAGINATION_LIMIT = 100;

export const MAX_PAGINATION_LIMIT = 1000;

export const PaginationQuerySchema = Type.Object({
  limit: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: MAX_PAGINATION_LIMIT,
    default: DEFAULT_PAGINATION_LIMIT,
    description: "Number of items to return (max 1000)",
  })),
  after: Type.Optional(Type.String({
    description: "Cursor for next page",
  })),
});

export type TypePaginationQuerySchema = Static<typeof PaginationQuerySchema>;

export type PaginationQuery = {
  limit?: number;
  after?: string;
};

export const PaginationMetaSchema = Type.Object({
  limit: Type.Integer(),
  nextCursor: Type.Optional(Type.String()),
  hasMore: Type.Optional(
    Type.Boolean({ description: "Whether there are more items available" }),
  ),
});

export type PaginationMeta = {
  limit: number;
  nextCursor?: string;
  hasMore?: boolean;
};

export function createPaginatedResponseSchema<T extends TSchema>(schema: T) {
  return Type.Object({
    data: Type.Array(schema),
    pagination: PaginationMetaSchema,
  });
}

export type PaginatedResponse<T> = {
  data: T[];
  pagination: PaginationMeta;
};

// Extract and validate pagination parameters from request
export function getPaginationParams<T extends Object>(
  query: TypePaginationQuerySchema,
  expectedCursorFields?: (keyof T)[],
): {
  limit: number;
  after: T | undefined;
  offset?: number;
} {
  const limit = Math.min(
    Math.max(1, parseInt(String(query.limit ?? 1)) || DEFAULT_PAGINATION_LIMIT),
    MAX_PAGINATION_LIMIT,
  );

  let after: T | undefined;
  let offset: number | undefined;

  if (query.after) {
    // First try to parse as a number (for offset-based pagination)
    const numericOffset = parseInt(query.after, 10);
    if (!isNaN(numericOffset) && numericOffset >= 0) {
      offset = numericOffset;
    } else {
      // If not a valid number, try to parse as base64-encoded cursor
      const decoded = decodeBase64(query.after);
      const parsed = JSON.parse(new TextDecoder().decode(decoded));

      if (typeof parsed !== "object" || parsed === null) {
        throw new Error("Invalid cursor object");
      }

      if (Object.keys(parsed).length === 0) {
        throw new Error("Invalid cursor content");
      }

      // Validate cursor structure if expected fields are provided
      if (
        expectedCursorFields &&
        !validateCursorStructure(parsed, expectedCursorFields)
      ) {
        throw new Error("Invalid cursor structure");
      }

      after = parsed as T;
    }
  }

  if (offset && offset < 0) {
    throw new Error("Invalid offset: must be non-negative integer");
  }

  return { limit, after, offset };
}

// Create pagination metadata
export function createPaginationMeta<T extends Record<string, any>>(
  limit: number,
  data: T[],
  cursorFields: (keyof T)[],
  nextCursorSeed?: Record<string, any> | null,
): PaginationMeta {
  const meta: PaginationMeta = { limit };
  const hasMore = data.length > limit;

  if (hasMore) {
    // Remove the extra item that was fetched to check for `hasMore`
    data.pop();
  }
  meta.hasMore = hasMore;

  if (hasMore) {
    let cursorObject: Record<string, any>;
    if (nextCursorSeed) {
      // Use the provided seed for the next cursor (e.g., for offset-based pagination)
      cursorObject = nextCursorSeed;
    } else if (data.length > 0) {
      // Build the cursor from the last item in the dataset
      const lastItem = data[data.length - 1];
      cursorObject = {};
      for (const field of cursorFields) {
        cursorObject[field as string] = lastItem[field];
      }
    } else {
      return meta;
    }

    const cursorString = JSON.stringify(cursorObject);
    meta.nextCursor = encodeBase64(new TextEncoder().encode(cursorString));
  }

  return meta;
}
