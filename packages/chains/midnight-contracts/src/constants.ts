// ============================================================================
// Constants
// ============================================================================

export const CONSTANTS = {
    /** Transaction TTL duration in milliseconds (1 hour) */
    TTL_DURATION_MS: 60 * 60 * 1000,

    /** Wallet sync progress logging throttle interval */
    WALLET_SYNC_THROTTLE_MS: 10_000,

    /**
     * Wallet sync timeout (4 hours). Override with
     * `MIDNIGHT_WALLET_SYNC_TIMEOUT_MS`.
     *
     * This is a backstop, not a health check. A dust cold sync on preprod was
     * measured at ~66 minutes (1,438,641 indices at ~365 idx/s) against a real
     * chain at block 2,143,432 — the previous 10-minute default failed every
     * default-configured cold sync, which made it a bug rather than a tunable.
     * Mainnet is longer still, so the default buys headroom rather than a tight
     * fit; a genuinely stuck sync is caught in ~60 s by the emission-silence
     * detector in `waitForDustFundsWithRetry`, not by this number.
     */
    WALLET_SYNC_TIMEOUT_MS: 14_400_000,

    /**
     * How long to wait for funds to ARRIVE once a wallet is synced (10
     * minutes). Override with `MIDNIGHT_WALLET_FUNDING_TIMEOUT_MS`.
     *
     * Deliberately separate from the sync timeout: waiting for a chain replay
     * and waiting for someone to send NIGHT are different questions, and
     * sharing one number meant an unfunded wallet inherited the multi-hour sync
     * budget and hung instead of failing.
     */
    WALLET_FUNDING_TIMEOUT_MS: 600_000,

    /**
     * Deadline for `registerNightForDust`'s "unshielded + dust are strictly
     * complete" precheck (10 minutes). Override with
     * `MIDNIGHT_DUST_REGISTRATION_PRECHECK_TIMEOUT_MS`.
     *
     * Also separate from the sync timeout, and for a sharper reason: in
     * dust-only mode the unshielded sub-wallet this waits on has been stopped,
     * so the wait can never succeed. It must stay bounded by something small
     * enough to give up on. (Unshielded sync itself is ~1 s on preprod.)
     */
    DUST_REGISTRATION_PRECHECK_TIMEOUT_MS: 600_000,

    /** Additional fee overhead for dust transactions (in smallest unit) */
    DUST_FEE_OVERHEAD: 300_000_000_000_000n,

    /** Fee blocks margin for dust wallet */
    DUST_FEE_BLOCKS_MARGIN: 5,
} as const;