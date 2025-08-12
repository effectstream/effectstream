import { Type } from "@sinclair/typebox";
import type { FastifyRequest } from "fastify";

export const DEFAULT_PAGINATION_LIMIT = 20;

export const MAX_PAGINATION_LIMIT = 1000;

export const PaginationQuerySchema = Type.Object({
  limit: Type.Optional(Type.Integer({
    minimum: 1,
    maximum: MAX_PAGINATION_LIMIT,
    default: DEFAULT_PAGINATION_LIMIT,
    description: "Number of items to return (max 1000)",
  })),
  skip: Type.Optional(Type.Integer({
    minimum: 0,
    default: 0,
    description: "Number of items to skip",
  })),
  count: Type.Optional(Type.Boolean({
    default: false,
    description:
      "Whether to include total count (may be expensive for large datasets)",
  })),
});

export type PaginationQuery = {
  limit?: number;
  skip?: number;
  count?: boolean;
};

export const PaginationMetaSchema = Type.Object({
  limit: Type.Integer(),
  skip: Type.Integer(),
  total: Type.Optional(
    Type.Integer({
      description:
        "Total number of items (may not be available for all endpoints)",
    }),
  ),
  hasMore: Type.Optional(
    Type.Boolean({ description: "Whether there are more items available" }),
  ),
});

export type PaginationMeta = {
  limit: number;
  skip: number;
  total?: number;
  hasMore?: boolean;
};

export function createPaginatedResponseSchema<T extends any>(itemSchema: T) {
  return Type.Object({
    data: Type.Array(itemSchema as any),
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
  skip: number;
  count: boolean;
} {
  const query = request.query as any;
  const limit = Math.min(
    Math.max(1, parseInt(query.limit as string) || DEFAULT_PAGINATION_LIMIT),
    MAX_PAGINATION_LIMIT,
  );
  const skip = Math.max(0, parseInt(query.skip as string) || 0);
  const count = query.count === true || query.count === "true";

  return { limit, skip, count };
}

// Create pagination metadata
export function createPaginationMeta(
  limit: number,
  skip: number,
  total?: number,
  actualCount?: number,
): PaginationMeta {
  const meta: PaginationMeta = { limit, skip };

  if (total !== undefined) {
    meta.total = total;
    meta.hasMore = skip + limit < total;
  } else if (actualCount !== undefined && actualCount < limit) {
    // We received fewer items than requested, so we know there are no more.
    meta.hasMore = false;
  }
  // When total is unknown and we received exactly `limit` items we cannot be sure
  // whether more items exist. In that case `hasMore` is omitted so clients can
  // decide to perform an additional request to probe for more data.
  return meta;
}

/**
 * Apply pagination to an array (for in-memory pagination)
 */
export function paginateArray<T>(
  array: T[],
  limit: number,
  skip: number,
): PaginatedResponse<T> {
  const data = array.slice(skip, skip + limit);
  const pagination = createPaginationMeta(
    limit,
    skip,
    array.length,
    data.length,
  );

  return { data, pagination };
}

// SQL LIMIT and OFFSET clause generator
export function getSqlPagination(limit: number, skip: number): string {
  return `LIMIT ${limit} OFFSET ${skip}`;
}
