#!/usr/bin/env bun
/**
 * Manual deployment script for NFT contracts
 * Run this after the dev server is running to deploy contracts
 */

import { deploy } from "./deploy.ts";

console.log("Starting manual contract deployment...");
console.log("Make sure the dev server is running with 'bun run dev' in another terminal");
console.log("");

try {
  await deploy();
  console.log("");
  console.log("✅ Deployment successful!");
  console.log("Contracts are now deployed and ready to use.");
  console.log("");
  console.log("You can now:");
  console.log("  1. Refresh your browser");
  console.log("  2. Click 'Create Account(NFT)' to buy an NFT");
} catch (error) {
  console.error("");
  console.error("❌ Deployment failed:", error.message);
  console.error("");
  console.error("Full error:", error);
  if (error.stack) {
    console.error("Stack trace:", error.stack);
  }
  console.error("");
  console.error("Make sure:");
  console.error("  1. The dev server is running (bun run dev)");
  console.error("  2. The Hardhat network is accessible on localhost:8545");
  process.exit(1);
}
