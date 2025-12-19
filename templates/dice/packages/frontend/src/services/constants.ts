// Contract addresses for local Hardhat network
// These addresses are deterministic and will always be the same for local development

// Default to localhost hardhat network
export const CHAIN_URI: string = "http://localhost:8545";
export const CHAIN_CURRENCY_DECIMALS: number = 18;

// Hardhat Ignition deterministic contract addresses
// These addresses are always the same on localhost (chain ID 31337)
// based on the deployment order defined in ignition/modules/deploy.ts
//
// Deployment order:
// 1. PaimaL2Contract
// 2. AnnotatedMintNft (Account NFT)
// 3. NativeNftSale (implementation)
// 4. NativeNftSaleProxy (proxy)
export const NATIVE_NFT_SALE_PROXY: string = "0x610178dA211FEF7D417bC0e6FeD39F05609AD788";
export const NFT: string = "0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e";
