import {
  allInjectedWallets as _allInjectedWallets,
  sendTransaction as _sendTransaction,
  walletLogin,
  WalletMode,
} from "@paimaexample/wallets";
import { hardhat } from "viem/chains";
import { createWalletClient, custom } from 'viem'
import { createPublicClient, http } from 'viem'
import { mct_erc1155 } from '@multi-chain-transfer/custom-primitive-mct-erc1155/abi'
import * as Rx from "rxjs";

import * as Eip20Interact from './eip-20-interact.ts';
console.log(Eip20Interact);



// export const paimaEngineConfig = new PaimaEngineConfig(
//   "",
//   "",
//   "",
//   hardhat,
//   undefined,
//   undefined,
//   false,
// );

export async function loginEVM() {
  const result = await walletLogin({
    mode: WalletMode.EvmInjected,
    chain: hardhat,
    preferBatchedMode: false,
  });

  if (!result.success) throw new Error("Cannot login");
  const wallet = result.result;

  const client = createWalletClient({
    chain: hardhat,
    transport: custom({
      async request({ method, params }: any) {
        const response = await (wallet.provider as any).conn.api.request({method, params})
        return response
      }
    })
  });
  
  return { wallet, client };
}

export async function loginMidnight() {
  const result = await walletLogin({
    mode: WalletMode.Midnight,
  });

  if (!result.success) throw new Error("Cannot login");
  const paimaWallet = result.result;

  // const addr = paimaWallet.walletAddress;

 /** TEST */
 const { injectedWallet, internalWallet, providers } = await Eip20Interact.connectMidnightWallet((paimaWallet.provider as any).conn.api);
 console.log({injectedWallet, internalWallet, providers});
 const addr = await Rx.firstValueFrom(internalWallet.state().pipe(Rx.map((state: any) => state.address)));
 console.log({addr});

 const { contract, state, contractAddress } = await Eip20Interact.connectToContract(providers);
 console.log({contract, state, contractAddress});
 return {
  addr,
  contract,
  contractAddress,
  state,
  wallet: injectedWallet,
 }
}

export async function midnight_balanceOf(contract: any, addr: string) {
  try {
    return await Eip20Interact.balanceOf(contract, addr);
  } catch (error) {
    console.error(0, {error});
  }
}

export async function midnight_mint(contract: any, addr: string, amount: bigint) {
  try {
    return await Eip20Interact.mint(contract, addr, amount);
  } catch (error) {
    console.error(1, {error});
  }
}

export async function midnight_transferToEVM(contract: any, addr: string, targetAddress: string, amount: bigint) {
  try {
    const txHash = Math.random().toString(36);
    // txHass: ArrayBuffer of 16 bytes
    const txHashArrayBuffer = new ArrayBuffer(16);
    const txHashView = new Uint8Array(txHashArrayBuffer);
    txHashView.set(new TextEncoder().encode(txHash));
    return await Eip20Interact.transferToEvm(contract, addr, targetAddress, amount, txHashView as any);
  } catch (error) {
    console.error(1, {error});
  }
}


export async function contract_balanceOf(address: `0x${string}`, tokenId: bigint) {
  const data = await publicClient.readContract({
    address: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    abi: mct_erc1155.abi,
    functionName: 'balanceOf',
    args: [
      address,
      tokenId
    ]
  });
  return data;
}

const publicClient = createPublicClient({ 
  chain: hardhat,
  transport: http()
})

export async function contract_safeTransferFrom(client: any, wallet: any, to_addr: `0x${string}`, amount: string) {
  console.log("start");
  const accounts = await client.getAddresses()
  const { request } = await publicClient.simulateContract({
    account: accounts[0],
    address: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    abi: mct_erc1155.abi,
    functionName: 'safeTransferFrom',
    args: [
      wallet.walletAddress,
      to_addr,
      1n,
      BigInt(amount),
      "0x",
    ]
  })
  const _hast = await client.writeContract(request)
  console.log("end");
}

export async function contract_transferToMidnight(client: any, wallet: any, amount: bigint, midnightAddress: `0x${string}`) {
  console.log("start");
  const accounts = await client.getAddresses()
  const { request } = await publicClient.simulateContract({
    account: accounts[0],
    address: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    abi: mct_erc1155.abi,
    functionName: 'transferToMidnight',
    args: [
      amount,
      midnightAddress,
    ],
  });
  const _hash = await client.writeContract(request)
  console.log("end");
}

export async function contract_mint(client: any, wallet: any, amount: bigint) {
  console.log("start");
  const accounts = await client.getAddresses()
  const { request } = await publicClient.simulateContract({
    account: accounts[0],
    address: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    abi: mct_erc1155.abi,
    functionName: 'mint',
    args: [
      wallet.walletAddress,
      // 1n,
      amount,
      // "0x",
    ],
  });
  const _hash = await client.writeContract(request)
  console.log("end");
}

export async function contract_safeBatchTransferFrom(client: any, wallet: any, to_addr: `0x${string}`, ids: bigint[], amounts: bigint[]) {
  console.log("start");
  const accounts = await client.getAddresses()
  const { request } = await publicClient.simulateContract({
    account: accounts[0],
    address: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    abi: mct_erc1155.abi,
    functionName: 'safeBatchTransferFrom',
    args: [
      wallet.walletAddress,
      to_addr,
      ids,
      amounts,
      "0x",
    ]
  })
  const _hast = await client.writeContract(request)
  console.log("end");
}
