#!/usr/bin/env -S deno run -A
/**
 * Simple deployment script using ethers.js directly
 */

import { JsonRpcProvider, Wallet, ContractFactory } from "npm:ethers@6.16.0";

// Import contract artifacts
const PaimaL2Contract = JSON.parse(
  await Deno.readTextFile("./build/artifacts/hardhat/src/contracts/PaimaL2Contract.sol/PaimaL2Contract.json")
);
const AnnotatedMintNft = JSON.parse(
  await Deno.readTextFile("./build/artifacts/hardhat/src/contracts/AnnotatedMintNft.sol/AnnotatedMintNft.json")
);
const NativeNftSale = JSON.parse(
  await Deno.readTextFile("./build/artifacts/hardhat/src/contracts/NativeNftSale.sol/NativeNftSale.json")
);
const NativeNftSaleProxy = JSON.parse(
  await Deno.readTextFile("./build/artifacts/hardhat/src/contracts/Proxy/NativeNftSaleProxy.sol/NativeNftSaleProxy.json")
);

console.log("Connecting to Hardhat network...");
const provider = new JsonRpcProvider("http://localhost:8545");
const deployer = new Wallet(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // Hardhat account #0
  provider
);

console.log(`Deployer address: ${deployer.address}`);

// Wait for network to fully stabilize
console.log("Waiting for network to stabilize...");
await new Promise(r => setTimeout(r, 5000));

// Check current nonce
const currentNonce = await provider.getTransactionCount(deployer.address);
console.log(`Current nonce: ${currentNonce}`);

if (currentNonce !== 0) {
  console.log("");
  console.log("⚠️  WARNING: The Hardhat network nonce is not 0.");
  console.log("   This might indicate contracts were already deployed.");
  console.log("   Continuing with deployment using current nonce...");
  console.log("");
}

console.log("");

try {
  // Get current nonce and track it explicitly
  let nonce = await provider.getTransactionCount(deployer.address);
  console.log(`Starting deployment with nonce: ${nonce}`);
  console.log("");

  // Deploy PaimaL2Contract
  console.log("Deploying PaimaL2Contract...");
  const l2Factory = new ContractFactory(PaimaL2Contract.abi, PaimaL2Contract.bytecode, deployer);
  const l2Contract = await l2Factory.deploy(
    "0xEFfE522D441d971dDC7153439a7d10235Ae6301f", // owner
    0, // fee
    { nonce: nonce++ } // Explicitly set nonce
  );
  await l2Contract.waitForDeployment();
  const l2Address = await l2Contract.getAddress();
  console.log(`✅ PaimaL2Contract deployed at: ${l2Address}`);

  // Deploy AnnotatedMintNft
  console.log("Deploying AnnotatedMintNft...");
  const nftFactory = new ContractFactory(AnnotatedMintNft.abi, AnnotatedMintNft.bytecode, deployer);
  const nftContract = await nftFactory.deploy(
    "Dice Account", // name
    "DICE", // ticker
    1_000_000_000, // maxSupply
    deployer.address, // owner
    { nonce: nonce++ }
  );
  await nftContract.waitForDeployment();
  const nftAddress = await nftContract.getAddress();
  console.log(`✅ AnnotatedMintNft deployed at: ${nftAddress}`);

  // Deploy NativeNftSale (implementation)
  console.log("Deploying NativeNftSale...");
  const saleFactory = new ContractFactory(NativeNftSale.abi, NativeNftSale.bytecode, deployer);
  const saleContract = await saleFactory.deploy({ nonce: nonce++ });
  await saleContract.waitForDeployment();
  const saleAddress = await saleContract.getAddress();
  console.log(`✅ NativeNftSale deployed at: ${saleAddress}`);

  // Deploy NativeNftSaleProxy with price
  const price = 1000000000000000n; // 0.001 ETH
  console.log("Deploying NativeNftSaleProxy...");
  console.log(`  NFT price: ${price} wei (0.001 ETH)`);
  const proxyFactory = new ContractFactory(NativeNftSaleProxy.abi, NativeNftSaleProxy.bytecode, deployer);
  const proxyContract = await proxyFactory.deploy(
    saleAddress, // implementation
    deployer.address, // owner
    nftAddress, // nft address
    price, // price
    { nonce: nonce++ }
  );
  await proxyContract.waitForDeployment();
  const proxyAddress = await proxyContract.getAddress();
  console.log(`✅ NativeNftSaleProxy deployed at: ${proxyAddress}`);

  // Set minter on NFT contract
  console.log("Setting minter on NFT contract...");
  const setMinterTx = await nftContract.setMinter(proxyAddress, { nonce: nonce++ });
  await setMinterTx.wait();
  console.log("✅ Minter set");

  console.log("");
  console.log("🎉 All contracts deployed successfully!");
  console.log("");
  console.log("Contract addresses:");
  console.log(`  PaimaL2Contract: ${l2Address}`);
  console.log(`  AnnotatedMintNft: ${nftAddress}`);
  console.log(`  NativeNftSale: ${saleAddress}`);
  console.log(`  NativeNftSaleProxy: ${proxyAddress}`);

  // Write deployed addresses to file for Paima config
  const deployedAddresses = {
    "L2Contract#PaimaL2Contract": l2Address,
    "AccountNft#AnnotatedMintNft": nftAddress,
    "AccountNft#NativeNftSale": saleAddress,
    "AccountNft#NativeNftSaleProxy": proxyAddress,
  };

  const deploymentDir = "./ignition/deployments/chain-31337";
  await Deno.mkdir(deploymentDir, { recursive: true });
  await Deno.writeTextFile(
    `${deploymentDir}/deployed_addresses.json`,
    JSON.stringify(deployedAddresses, null, 2)
  );
  console.log("");
  console.log("✅ Deployment addresses saved to ignition/deployments/chain-31337/deployed_addresses.json");

  console.log("");
  console.log("Next steps:");
  console.log("  1. Restart the dev server to pick up new contract addresses");
  console.log("  2. Refresh your browser");
  console.log("  3. Click 'Create Account(NFT)' to buy an NFT for 0.001 ETH");

} catch (error) {
  console.error("");
  console.error("❌ Deployment failed:", error.message);
  console.error("");
  if (error.stack) {
    console.error(error.stack);
  }
  Deno.exit(1);
}
