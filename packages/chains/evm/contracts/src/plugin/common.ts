// import type { HardhatRuntimeEnvironment } from 'hardhat/types';
// import { isAddress } from 'viem';
// import type { WalletClient } from 'viem';
// import { scope } from 'hardhat/config';
// import { createInterface } from 'node:readline/promises';
// import { stdin, stdout } from 'process';

// export const paimaScope = scope('paima', 'Paima Engine tasks');

// const rl = createInterface({ input: stdin, output: stdout });

// export async function getOrAskString(cmdLineValue: unknown, question: string): Promise<string> {
//   if (cmdLineValue != null && typeof cmdLineValue !== 'string') {
//     throw new Error(`Invalid type passed. Expected string: ${JSON.stringify(cmdLineValue)}`);
//   }
//   return cmdLineValue != null ? cmdLineValue : await rl.question(question);
// }
// export async function getContract(
//   hre: HardhatRuntimeEnvironment,
//   cmdLineAccount: unknown
// ): Promise<{ signer: WalletClient; account: `0x${string}` }> {
//   const account = await getOrAskString(cmdLineAccount, 'Contract address? ');
//   if (!isAddress(account)) {
//     throw new Error(`Invalid contract address passed ${account}`);
//   }

//   const wallets = await hre.viem.getWalletClients();

//   return { signer: wallets[0], account };
// }
// export function ownerCheck(expectedOwner: string, caller: string): void {
//   if (expectedOwner !== caller) {
//     throw new Error(`Owner mismatch. Expected ${expectedOwner}, but signer was ${caller}`);
//   }
// }
