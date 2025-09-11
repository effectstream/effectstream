import { type Static, type TSchema, Type } from "@sinclair/typebox";
import type { FastifyRequest } from "fastify";
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

export class InvalidColumnNameError extends Error {
  constructor(columnName: string) {
    super(`Invalid column name: ${columnName}`);
    this.name = "InvalidColumnNameError";
  }
}

export function validateAndEscapeColumnName(columnName: string): string {
  if (!validateColumnName(columnName)) {
    throw new InvalidColumnNameError(columnName);
  }
  return escapeColumnName(columnName);
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
      try {
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
      } catch (e) {
        // Invalid cursor or offset, treat as no cursor
        after = undefined;
        offset = undefined;
      }
    }
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
