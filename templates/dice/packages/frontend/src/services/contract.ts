import { BrowserProvider, JsonRpcProvider } from "ethers";
import type { JsonRpcSigner } from "ethers";

import {
  NATIVE_NFT_SALE_PROXY,
  NFT,
  CHAIN_CURRENCY_DECIMALS,
  CHAIN_URI,
} from "./constants";
import { characterToNumberMap } from "./utils";
import {
  NativeNftSale__factory,
  AnnotatedMintNft__factory,
} from "@typechain/index";
import type { WalletMode } from "@paima/providers";
import { WalletModeMap } from "@paima/providers";

export type SignerProvider = BrowserProvider | JsonRpcProvider;

// we have to use a type alias because Vite requires isolatedModules which disallows const enums
const evmInjectedMode: WalletMode.EvmInjected = 0;

const DECIMALS = 10n ** BigInt(CHAIN_CURRENCY_DECIMALS);

const getPublicClient = (): JsonRpcProvider => {
  return new JsonRpcProvider(CHAIN_URI);
};
const getWalletClient = (_account: string): BrowserProvider => {
  const provider = new BrowserProvider(
    WalletModeMap[evmInjectedMode].getOrThrowProvider().getConnection().api,
  );
  return provider;
};
export const getProvider = (account?: string): SignerProvider => {
  if (account) {
    return getWalletClient(account);
  }
  return getPublicClient();
};
export const getSigner = async (account: string): Promise<JsonRpcSigner> => {
  return await getWalletClient(account).getSigner();
};

/** Note: the signer arg is available, but you probably never want to use it for this one. */
export const NftContract = async (account: string) => {
  const signer = await getSigner(account);
  return AnnotatedMintNft__factory.connect(NFT, signer);
};

export const NativeNftSaleProxyContract = async (account: string) => {
  const signer = await getSigner(account);
  return NativeNftSale__factory.connect(NATIVE_NFT_SALE_PROXY, signer);
};

export async function fetchNftPrice(account: string): Promise<bigint> {
  const nativeNftSaleProxyContract = await NativeNftSaleProxyContract(account);
  const tokenPrice = await nativeNftSaleProxyContract.nftPrice();
  return tokenPrice;
}

export async function fetchCurrentNftTokenId(account: string): Promise<bigint> {
  const contract = await NftContract(account);
  const result = await contract.currentTokenId();
  return result;
}

/**
 * Amount that was and/or can be minted.
 * Not to be confused with amount already minted, that is "totalSupply".
 * Not to be confused with amount remaining to be minted, there is no name for that.
 */
export async function fetchNftMaxSupply(account: string): Promise<bigint> {
  const contract = await NftContract(account);
  const result = await contract.maxSupply();
  return result;
}

export const buyNft = async (account: string) => {
  console.log("buyNFT: ", account);
  const tokenPrice = await fetchNftPrice(account);

  const provider = getProvider();
  // https://github.com/ethers-io/ethers.js/discussions/4219#discussioncomment-6375652
  const gasPrice = (await provider.getFeeData()).gasPrice;

  const characterNumber = characterToNumberMap["null"];

  const nativeNftSaleProxyContract = await NativeNftSaleProxyContract(account);
  const tx = await nativeNftSaleProxyContract.buyNft(account, "", {
    gasPrice,
    gasLimit: 800000,
    value: tokenPrice.toString(),
  });
  return tx;
};
