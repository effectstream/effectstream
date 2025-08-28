import { type TSchema, Type } from "@sinclair/typebox";
import type { FastifyRequest } from "fastify";
import { decodeBase64, encodeBase64 } from "@std/encoding/base64";

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
export function getPaginationParams(request: FastifyRequest): {
  limit: number;
  after: any;
} {
  const query = request.query as any;
  const limit = Math.min(
    Math.max(1, parseInt(query.limit as string) || DEFAULT_PAGINATION_LIMIT),
    MAX_PAGINATION_LIMIT,
  );

  let after: any;

  if (query.after) {
    try {
      const decoded = decodeBase64(query.after);
      after = JSON.parse(new TextDecoder().decode(decoded));
    } catch (e) {
      // Invalid cursor, treat as no cursor
      after = undefined;
    }
  }

  return { limit, after };
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
