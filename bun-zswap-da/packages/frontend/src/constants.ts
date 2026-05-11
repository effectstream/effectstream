// Filter directions used in ZSwapList and useZSwapAPI
export const FILTER_DIRECTION = {
  ANY: 'any',
  GIVING: 'GIVING',
  WANTING: 'WANTING',
} as const;

// Token types
export const TOKEN_TYPE = {
  SHIELDED: 'shielded',
  UNSHIELDED: 'unshielded',
} as const;

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 100;

// Validation
export const MAX_TOKEN_NAME_LENGTH = 16;
