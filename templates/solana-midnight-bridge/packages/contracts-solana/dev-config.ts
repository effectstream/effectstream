// Local-mode constants shared by the orchestrator scripts, the node and the tests.
export const DEV_SOLANA_RPC_PORT = Number(process.env.SOLANA_RPC_PORT ?? "8899");
export const DEV_SOLANA_FAUCET_PORT = Number(process.env.SOLANA_FAUCET_PORT ?? "9900");

/** The local validator's RPC. `SOLANA_RPC_URL` overrides it (e.g. a Docker sibling). */
export const DEV_SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ?? `http://127.0.0.1:${DEV_SOLANA_RPC_PORT}`;

/** Deployment file the local orchestrator writes (`deployments/local.json`). */
export const LOCAL_DEPLOYMENT = "local";

/** Test tokens (whole units) `init-local.ts` mints to the dev user. */
export const DEV_USER_TEST_TOKENS = 1_000n;
