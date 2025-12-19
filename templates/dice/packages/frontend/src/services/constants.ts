export const CHAIN_URI: string = process.env.CHAIN_URI;
export const CHAIN_CURRENCY_DECIMALS: number = parseInt(
  process.env.CHAIN_CURRENCY_DECIMALS ?? '18'
);
export const NATIVE_NFT_SALE_PROXY: string = process.env.NATIVE_NFT_SALE_PROXY;
export const NFT: string = process.env.NFT;

if (CHAIN_URI == null || NATIVE_NFT_SALE_PROXY == null || NFT == null)
  throw new Error("ERROR: Did you forget to fill out .env?");
