import type { ProcessConfig } from "../src/config.ts";

export const SolanaNames = {
  SOLANA_VALIDATOR: "solana-validator",
  SOLANA_VALIDATOR_WAIT: "solana-validator-wait",
} as const;

export function launchSolana(
  opts?: { rpcPort?: number; faucetPort?: number; reset?: boolean },
): ProcessConfig[] {
  const rpcPort = opts?.rpcPort ?? 8899;
  const faucetPort = opts?.faucetPort ?? 9900;
  const reset = opts?.reset ?? true;

  return [
    {
      stopProcessAtPort: [rpcPort, faucetPort],
      name: SolanaNames.SOLANA_VALIDATOR,
      description: "Start Solana test validator",
      command: "bunx",
      args: [
        "@effectstream/solana-node",
        "--rpc-port", String(rpcPort),
        "--faucet-port", String(faucetPort),
        ...(reset ? ["--reset"] : []),
      ],
      waitToExit: false,
      critical: true,
    },
    {
      name: SolanaNames.SOLANA_VALIDATOR_WAIT,
      description: "Wait for Solana test validator RPC to be ready",
      command: "bash",
      args: [
        "-c",
        `for i in $(seq 1 60); do curl -sf http://localhost:${rpcPort}/health > /dev/null 2>&1 && exit 0; sleep 1; done; echo "Solana validator failed to start"; exit 1`,
      ],
      waitToExit: true,
      dependsOn: [SolanaNames.SOLANA_VALIDATOR],
    },
  ];
}
