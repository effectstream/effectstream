import {
  allInjectedWallets as _allInjectedWallets,
  PaimaEngineConfig,
  sendTransaction as _sendTransaction,
  walletLogin,
  WalletMode,
} from "@paimaexample/wallets";
import { hardhat } from "viem/chains";
import { createWalletClient, custom } from 'viem'
import { createPublicClient, http } from 'viem'
import { mct_erc1155 } from './abi.js'

export const paimaEngineConfig = new PaimaEngineConfig(
  "",
  "",
  "",
  hardhat,
  undefined,
  undefined,
  false,
);

let wallet = null;
async function loginEVM() {
  const result = await walletLogin({
    mode: WalletMode.EvmInjected,
    chain: hardhat,
  });

  if (!result.success) throw new Error("Cannot login");
  wallet = result.result;

  const client = createWalletClient({
    chain: hardhat,
    transport: custom({
      async request({ method, params }) {
        const response = await wallet.provider.conn.api.request({method, params})
        return response
      }
    })
  });
  return { wallet, client };
}

async function loginMidnight() {
  const result = await walletLogin({
    mode: WalletMode.Midnight,
  });

  if (!result.success) throw new Error("Cannot login");
  wallet = result.result;

  const client = createWalletClient({
    chain: hardhat,
    transport: custom({
      async request({ method, params }) {
        const response = await wallet.provider.conn.api.request({method, params})
        return response
      }
    })
  });
  return { wallet, client };
}

 
async function contract_balanceOf(address, tokenId) {
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

async function contract_safeTransferFrom(client, wallet, to_addr, amount) {
  console.log("start");
  // [
  // {"internalType":"address","name":"from","type":"address"},
  // {"internalType":"address","name":"to","type":"address"},
  // {"internalType":"uint256","name":"id","type":"uint256"},
  // {"internalType":"uint256","name":"value","type":"uint256"},
  // {"internalType":"bytes","name":"data","type":"bytes"}
  // ]
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

async function contract_transferToMidnight(client, wallet, amount) {
  console.log("start");
  const accounts = await client.getAddresses()
  const { request } = await publicClient.simulateContract({
    account: accounts[0],
    address: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    abi: mct_erc1155.abi,
    functionName: 'transferToMidnight',
    args: [
      amount,
      wallet.walletAddress,
    ],
  });
  const _hash = await client.writeContract(request)
  console.log("end");
}

async function contract_mint(client, wallet, amount) {
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

async function contract_safeBatchTransferFrom(client, wallet, to_addr, ids, amounts) {
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

globalThis.paima = {
  ...globalThis.paima,
  contract_balanceOf,
  loginEVM,
  loginMidnight,
  contract_safeTransferFrom,
  contract_transferToMidnight,
  contract_mint,
  contract_safeBatchTransferFrom,
};


