import { walletLogin, WalletMode } from "@paimaexample/wallets";
import { hardhat } from "viem/chains";
import { createWalletClient, custom } from "viem";
import { createPublicClient, http } from "viem";

import * as unshielded_erc20 from "./contracts/erc20.ts";
import * as erc7683 from "./contracts/intents.ts";

// import { mct_erc1155 } from "@multi-chain-transfer/evm-contracts";
// const mct_erc1155 = {
//   abi: [],
// }

// import * as Eip1155Interact from "./eip-1155-interact.ts";

// const EVM_CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// export async function loginEVM() {
//   const result = await walletLogin({
//     mode: WalletMode.EvmInjected,
//     chain: hardhat,
//     preferBatchedMode: false,
//   });

//   if (!result.success) throw new Error("Cannot login");
//   const wallet = result.result;

//   const client = createWalletClient({
//     chain: hardhat,
//     transport: custom({
//       async request({ method, params }: any) {
//         const response = await (wallet.provider as any).conn.api.request({
//           method,
//           params,
//         });
//         return response;
//       },
//     }),
//   });

//   return { wallet, client };
// }

export async function loginMidnight() {
  const result = await walletLogin({
    mode: WalletMode.Midnight,
  });

  if (!result.success) throw new Error("Cannot login");
  const paimaWallet = result.result;

  const response = {
    addr: "",
    contract: {
      unshielded_erc20: null,
      erc7683: null,
    },
    contractAddress: {
      unshielded_erc20: "",
      erc7683: "",
    },
    stateA: {
      unshielded_erc20: null,
      erc7683: null,
    },
    stateB: {
      unshielded_erc20: null,
      erc7683: null,
    },
    wallet: null,
  } as any;

  {
    const { injectedWallet, providers } =
      await unshielded_erc20.connectMidnightWallet(
        (paimaWallet.provider as any).conn.api
      );

    response.stateA.unshielded_erc20 = await injectedWallet.state();
    response.addr = response.stateA.unshielded_erc20.address;

    const {
      contract,
      state: state2,
      contractAddress,
    } = await unshielded_erc20.connectToContract(providers);
    response.contract.unshielded_erc20 = contract;
    response.stateB.unshielded_erc20 = state2;
    response.contractAddress.unshielded_erc20 = contractAddress;
  }
  {
    const { injectedWallet, providers } =
      await erc7683.connectMidnightWallet(
        (paimaWallet.provider as any).conn.api
      );

    response.stateA.erc7683 = await injectedWallet.state();
    response.addr = response.stateA.erc7683.address;

    const {
      contract: erc7683Contract,
      state: erc7683State,
      contractAddress: erc7683ContractAddress,
    } = await erc7683.connectToContract(providers);
    response.contract.erc7683 = erc7683Contract;
    response.stateB.erc7683 = erc7683State;
    response.contractAddress.erc7683 = erc7683ContractAddress;
  }  

  return response;
}


// export async function midnight_balanceOf(contract: any, addr: string) {
//   try {
//     console.log("Balance of", contract, addr);
//     return await Eip1155Interact.balanceOf(contract, addr);
//   } catch (error) {
//     console.error(0, { error });
//   }
// }

export async function createIntent(
  contract: any,
  addr: string,
  amount: bigint
) {
  try {
    return await erc7683.createIntent(contract, addr, {
    
    });
  } catch (error) {
    console.error(1, { error });
  }
}

// export async function midnight_transferToEVM(
//   contract: any,
//   addr: string,
//   targetAddress: string,
//   amount: bigint
// ) {
//   try {
//     const txHash = Math.random().toString(36);
//     // txHass: ArrayBuffer of s bytes
//     const txHashArrayBuffer = new ArrayBuffer(16);
//     const txHashView = new Uint8Array(txHashArrayBuffer);
//     txHashView.set(new TextEncoder().encode(txHash));
//     return await Eip1155Interact.transferToEvm(
//       contract,
//       addr,
//       targetAddress,
//       amount,
//       txHashView as any
//     );
//   } catch (error) {
//     console.error(1, { error });
//   }
// }

// export async function evm_balanceOf(address: `0x${string}`, tokenId: bigint) {
//   const data = await publicClient.readContract({
//     address: EVM_CONTRACT_ADDRESS,
//     abi: mct_erc1155.abi,
//     functionName: "balanceOf",
//     args: [address, tokenId],
//   });
//   return data;
// }

// const publicClient = createPublicClient({
//   chain: hardhat,
//   transport: http(),
// });

// export async function evm_safeTransferFrom(
//   client: any,
//   wallet: any,
//   to_addr: `0x${string}`,
//   amount: string
// ) {
//   const accounts = await client.getAddresses();
//   const { request } = await publicClient.simulateContract({
//     account: accounts[0],
//     address: EVM_CONTRACT_ADDRESS,
//     abi: mct_erc1155.abi,
//     functionName: "safeTransferFrom",
//     args: [wallet.walletAddress, to_addr, 1n, BigInt(amount), "0x"],
//   });
//   const _hast = await client.writeContract(request);
// }

// export async function evm_transferToMidnight(
//   client: any,
//   wallet: any,
//   amount: bigint,
//   midnightAddress: `0x${string}`
// ) {
//   const accounts = await client.getAddresses();
//   const txHash = Math.random().toString(36).substring(2, 15);
//   const { request } = await publicClient.simulateContract({
//     account: accounts[0],
//     address: EVM_CONTRACT_ADDRESS,
//     abi: mct_erc1155.abi,
//     functionName: "transferToMidnight",
//     args: [amount, midnightAddress, txHash],
//   });
//   const _hash = await client.writeContract(request);
// }

// export async function evm_mint(client: any, wallet: any, amount: bigint) {
//   const accounts = await client.getAddresses();
//   const { request } = await publicClient.simulateContract({
//     account: accounts[0],
//     address: EVM_CONTRACT_ADDRESS,
//     abi: mct_erc1155.abi,
//     functionName: "mint",
//     args: [
//       wallet.walletAddress,
//       // 1n,
//       amount,
//       // "0x",
//     ],
//   });
//   const _hash = await client.writeContract(request);
// }

// export async function evm_safeBatchTransferFrom(
//   client: any,
//   wallet: any,
//   to_addr: `0x${string}`,
//   ids: bigint[],
//   amounts: bigint[]
// ) {
//   console.log("start");
//   const accounts = await client.getAddresses();
//   const { request } = await publicClient.simulateContract({
//     account: accounts[0],
//     address: EVM_CONTRACT_ADDRESS,
//     abi: mct_erc1155.abi,
//     functionName: "safeBatchTransferFrom",
//     args: [wallet.walletAddress, to_addr, ids, amounts, "0x"],
//   });
//   const _hast = await client.writeContract(request);
//   console.log("end");
// }
