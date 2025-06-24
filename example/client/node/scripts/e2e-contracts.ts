import {
  type Account,
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type PublicClient,
  toHex,
  type WalletClient,
} from "npm:viem";
import { privateKeyToAccount } from "npm:viem/accounts";
import { hardhat } from "npm:viem/chains";
import {
  erc20 as erc20Abi,
  paimal2 as paimaL2Abi,
} from "@example/evm-contracts";

const __dirname = import.meta.dirname;

// These address are given the contract hash + the wallet nonce.
// As we deploy at the start, there nonce are 0 and 1.
// So to keep the test stable, deploy contracts at the start.
const knownPaimaL2ContractAddress =
  "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const knownERC20Address = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

// TODO
// This will be deployed by the engine.
export async function deployContracts(
  owner: `0x${string}`,
  privateKey: `0x${string}`,
): Promise<void> {
  console.log("🚀 Deploying PaimaL2Contract...");
  const paimaL2Contract = new Deno.Command("forge", {
    args: [
      "create",
      `${__dirname}/../../../../packages/chains/evm/contracts/src/contracts/PaimaL2Contract.sol:PaimaL2Contract`,
      "--broadcast",
      "--rpc-url",
      "0.0.0.0:8545",
      "--private-key",
      privateKey,
      "--constructor-args",
      owner,
      "0",
    ],
  });
  const { stdout, stderr } = await paimaL2Contract.output();
  // console.log(new TextDecoder().decode(stdout));
  console.log(new TextDecoder().decode(stderr));

  console.log("🪙 Deploying Erc20Dev...");
  const erc20Dev = new Deno.Command("forge", {
    args: [
      "create",
      `${__dirname}/../../../../packages/chains/evm/contracts/src/contracts/dev/Erc20Dev.sol:Erc20Dev`,
      "--broadcast",
      "--rpc-url",
      "0.0.0.0:8545",
      "--private-key",
      privateKey,
    ],
  });
  const { stdout: erc20DevStdout, stderr: erc20DevStderr } = await erc20Dev
    .output();
  // console.log(new TextDecoder().decode(erc20DevStdout));
  console.log(new TextDecoder().decode(erc20DevStderr));
}

// Viem Client(s)
function clients(privateKey: `0x${string}`): {
  account: Account;
  walletClient: WalletClient;
  publicClient: PublicClient;
} {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    chain: hardhat,
    transport: http(),
  });
  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(),
  });
  return { account, walletClient, publicClient };
}

export const paimaL2 = {
  submitGameInput: async (
    input: string[],
    privateKey: `0x${string}`,
  ): Promise<void> => {
    console.log("🎮 Submitting game input", input);
    const { account, walletClient, publicClient } = clients(privateKey);
    const hash = await walletClient.writeContract({
      account,
      chain: hardhat,
      address: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      abi: paimaL2Abi.metadata.output.abi,
      functionName: "paimaSubmitGameInput",
      args: [
        toHex(JSON.stringify(input)),
      ],
      value: parseEther("0.0000000001"),
    });

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });
    console.log(
      `  ${
        receipt.status === "success" ? "" : "❌"
      } Submit Game Input block ${receipt.blockNumber} @ Hash ${hash}`,
    );
  },
};

export const erc20 = {
  mint: async (
    mint_address: `0x${string}`,
    mint_private_key: `0x${string}`, // TODO: remove this
    amount: bigint,
  ) => {
    console.log("⚡ Minting", amount, "to", mint_address);
    const { account, walletClient, publicClient } = clients(mint_private_key);
    const { request } = await publicClient.simulateContract({
      account,
      chain: hardhat,
      address: knownERC20Address,
      abi: erc20Abi.abi,
      functionName: "mint",
      args: [
        mint_address,
        amount,
      ],
    });
    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });
    console.log(
      `  ${
        receipt.status === "success" ? "" : "❌"
      } Mint block ${receipt.blockNumber} @ Hash ${hash}`,
    );
  },
  transfer: async (
    from_private_key: `0x${string}`,
    to_address: `0x${string}`,
    amount: bigint,
  ) => {
    console.log("💸 Transferring", amount, "to", to_address);
    const { account, walletClient, publicClient } = clients(from_private_key);
    const { request } = await publicClient.simulateContract({
      account,
      address: knownERC20Address,
      abi: erc20Abi.abi,
      functionName: "transfer",
      args: [
        to_address,
        amount,
      ],
    });
    const hash = await walletClient.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
    });
    console.log(
      `  ${
        receipt.status === "success" ? "" : "❌"
      } Transfer block ${receipt.blockNumber} @ Hash ${hash}`,
    );
  },
};
