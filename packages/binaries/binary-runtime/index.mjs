import runtime from "./runtime.cjs";

export const {
  artifactDirectory,
  assertCacheCanBeCleaned,
  assertDownloadAllowed,
  binaryPath,
  ensureRuntimeDirectory,
  envFlag,
  isOffline,
  platformKey,
  runtimeDirectory,
  sha256File,
  usesExternalCache,
  verifyFile,
} = runtime;

export default runtime;
