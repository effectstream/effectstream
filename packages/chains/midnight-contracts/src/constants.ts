// ============================================================================
// Constants
// ============================================================================

export const CONSTANTS = {
    /** Transaction TTL duration in milliseconds (1 hour) */
    TTL_DURATION_MS: 60 * 60 * 1000,

    /** Wallet sync progress logging throttle interval */
    WALLET_SYNC_THROTTLE_MS: 10_000,

    /** Wallet sync timeout (10 minutes) */
    WALLET_SYNC_TIMEOUT_MS: 600_000,

    /** Additional fee overhead for dust transactions (in smallest unit) */
    DUST_FEE_OVERHEAD: 300_000_000_000_000n,

    /** Fee blocks margin for dust wallet */
    DUST_FEE_BLOCKS_MARGIN: 5,
} as const;