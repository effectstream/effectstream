// Contract addresses for local Hardhat network
// These addresses are deterministic and will always be the same for local development

// Default to localhost hardhat network
export const CHAIN_URI: string = "http://localhost:8545";
export const CHAIN_CURRENCY_DECIMALS: number = 18;

// Contract addresses deployed to localhost Hardhat network (chain ID 31337)
// These addresses are deterministic based on deployment order:
// 1. PaimaL2Contract: 0x5FbDB2315678afecb367f032d93F642f64180aa3
// 2. AnnotatedMintNft (Account NFT): 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
// 3. NativeNftSale (implementation): 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
// 4. NativeNftSaleProxy (proxy): 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
export const NATIVE_NFT_SALE_PROXY: string = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
export const NFT: string = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
