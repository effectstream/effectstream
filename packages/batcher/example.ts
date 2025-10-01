/**
 * Example usage of the new PaimaBatcher with HTTP server
 *
 * This example demonstrates how to create and use a PaimaBatcher
 * with the new HTTP server integration and OpenAPI documentation.
 */

import { PaimaBatcher } from "./mod.ts";
import { FileStorage } from "./mod.ts";
import { EvmChainConnector } from "./mod.ts";
import type { PaimaBatcherConfig } from "./mod.ts";

// Example EVM connector configuration
// Note: This is a simplified example - in production you'd use real values
const evmConnector = new EvmChainConnector(
  "0x1234567890123456789012345678901234567890",
  ("0x" + "1".repeat(64)) as any,
  {
    id: 1,
    name: "ethereum",
    network: "mainnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: ["https://mainnet.infura.io/v3/YOUR_API_KEY"] },
    },
    blockExplorers: {
      default: { name: "Etherscan", url: "https://etherscan.io" },
    },
    testnet: false,
  } as any,
  BigInt("1000000000000000"), // 0.001 ETH
  "ethereum",
);

// Example batcher configuration
const batcherConfig: PaimaBatcherConfig = {
  pollingIntervalMs: 5000, // Poll every 5 seconds
  connectors: {
    evm: evmConnector,
  },
  defaultTarget: "evm",

  // Per-connector batching criteria - allows different strategies per target
  batchingCriteria: {
    evm: {
      criteriaType: "hybrid",
      timeWindowMs: 60000, // OR
      maxBatchSize: 10, // Process every 1 minute OR when 10 inputs accumulated
    },
    // Other connectors would use DEFAULT_BATCHING_CRITERIA (size=1) if not specified
  },

  // HTTP server configuration
  port: 3000,
  enableHttpServer: true,
  enableEventSystem: false,
  confirmationLevel: "wait-receipt",
  maxRetries: 3,
  retryDelayMs: 5000,
};

// Global batcher instance for signal handlers
let globalBatcher: PaimaBatcher<any> | null = null;

// Create and initialize the batcher
async function main() {
  console.log("🚀 Starting PaimaBatcher with HTTP server...");

  const storage = new FileStorage("./batcher-data");
  const batcher = new PaimaBatcher(storage, batcherConfig);
  globalBatcher = batcher;

  try {
    await batcher.init();
    console.log("✅ Batcher initialized successfully!");

    console.log("📡 HTTP server available at: http://localhost:3000");
    console.log(
      "📖 OpenAPI documentation at: http://localhost:3000/documentation",
    );

    // Example: Add a test input
    const testInput = {
      address: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
      addressType: 1, // EVM
      input: "test input data",
      signature: "0x" + "0".repeat(130), // Placeholder signature
      timestamp: Date.now().toString(),
      target: "evm",
    };

    await batcher.batchInput(testInput as any);
    console.log("✅ Test input added to batcher");

    // Keep the process running
    console.log("Press Ctrl+C to stop...");
    await new Promise(() => {}); // Keep running indefinitely
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 Received SIGINT, shutting down gracefully...");
  if (globalBatcher) {
    await globalBatcher.gracefulShutdown();
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Received SIGTERM, shutting down gracefully...");
  if (globalBatcher) {
    await globalBatcher.gracefulShutdown();
  }
  process.exit(0);
});

if (import.meta.main) {
  main();
}
