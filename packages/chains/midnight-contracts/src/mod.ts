export { deployMidnightContract } from "./deploy.ts";
export { deployMidnightContractPhased } from "./deploy-phased.ts";
export type {
    DeployConfig,
    NetworkUrls,
    WalletResult,
    InitialOwner,
} from "./types.ts";
export {
    resolveWalletSyncTimeoutMs,
    suspendAuxWalletSyncForFees,
    resolveFacadeDustBalance,
    resolveFacadeDustAvailableCoins,
    safeStringifyProgress,
    syncAndWaitForFunds,
    buildWalletFacade,
    getInitialShieldedState,
    registerNightForDust,
    getInitialDustState,
    waitForDustFunds,
    waitForDustFundsWithRetry,
} from "./get-wallet-info.ts";
// Disk-backed dust persistence lives in its own node-only module so the
// browser-reachable ./wallet-info subpath carries no node:fs. This barrel is
// node-only anyway (deploy.ts imports node:fs/promises), so a static
// re-export here is fine and keeps the public API unchanged.
export { saveDustState, loadDustState } from "./dust-state.ts";
export type {
    WalletSyncMode,
    DustSyncWithRetryOptions,
} from "./get-wallet-info.ts";
export { CONSTANTS } from "./constants.ts";
export { 
    buildWalletAndWaitForFunds, 
    extractInitialOwnerFromWallet,    
} from "./build-wallet.ts";
export { readMidnightContract } from "./read-contract.ts";
export { configureMidnightNodeProviders } from "./providers.ts";
export { midnightNetworkConfig } from "./midnight-env.ts";
