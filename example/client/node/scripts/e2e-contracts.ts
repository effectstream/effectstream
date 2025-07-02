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
  erc721abi,
  paimal2 as paimaL2Abi,
} from "@example/evm-contracts";

const __dirname = import.meta.dirname;

// These address are given the contract hash + the wallet nonce.
// As we deploy at the start, there nonce are 0 and 1.
// So to keep the test stable, deploy contracts at the start.
export const contractAddresses = {
  paimaL2: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  erc20: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  erc721: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  erc20_2: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  erc721_2: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
} as const;

/**
 * Deploy the contracts.
 * TODO: This will be deployed by the engine.
 * @param owner - The owner of the contracts.
 * @param privateKey - The private key of the owner.
 */
export async function deployContracts(
  owner: `0x${string}`,
  privateKey: `0x${string}`,
): Promise<void> {
  const silent = true;
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
  if (!silent) {
    console.log(new TextDecoder().decode(stdout));
  }
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
  if (!silent) {
    console.log(new TextDecoder().decode(erc20DevStdout));
  }
  console.log(new TextDecoder().decode(erc20DevStderr));

  console.log("🎮 Deploying Erc721Dev...");
  const erc721Dev = new Deno.Command("forge", {
    args: [
      "create",
      `${__dirname}/../../../../packages/chains/evm/contracts/src/contracts/dev/Erc721Dev.sol:Erc721Dev`,
      "--broadcast",
      "--rpc-url",
      "0.0.0.0:8545",
      "--private-key",
      privateKey,
    ],
  });
  const { stdout: erc721DevStdout, stderr: erc721DevStderr } = await erc721Dev
    .output();
  if (!silent) {
    console.log(new TextDecoder().decode(erc721DevStdout));
  }
  console.log(new TextDecoder().decode(erc721DevStderr));

  console.log("🪙 Deploying Erc20Dev[2]...");
  const erc20Dev2 = new Deno.Command("forge", {
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
  const { stdout: erc20DevStdout2, stderr: erc20DevStderr2 } = await erc20Dev2
    .output();
  if (!silent) {
    console.log(new TextDecoder().decode(erc20DevStdout2));
  }
  console.log(new TextDecoder().decode(erc20DevStderr2));

  console.log("🎮 Deploying Erc721Dev[2]...");
  const erc721Dev2 = new Deno.Command("forge", {
    args: [
      "create",
      `${__dirname}/../../../../packages/chains/evm/contracts/src/contracts/dev/Erc721Dev.sol:Erc721Dev`,
      "--broadcast",
      "--rpc-url",
      "0.0.0.0:8545",
      "--private-key",
      privateKey,
    ],
  });
  const { stdout: erc721DevStdout2, stderr: erc721DevStderr2 } =
    await erc721Dev2
      .output();
  if (!silent) {
    console.log(new TextDecoder().decode(erc721DevStdout2));
  }
  console.log(new TextDecoder().decode(erc721DevStderr2));
}

/**
 * Create a viem client.
 * @param privateKey - The private key of the account.
 * @returns The account, wallet client and public client.
 */
function clients(privateKey: `0x${string}`): {
  account: Account;
  walletClient: WalletClient;
  publicClient: PublicClient;
} {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain: hardhat,
    transport: http(),
  });
  const publicClient = createPublicClient({
    chain: hardhat,
    transport: http(),
  });
  return { account, walletClient, publicClient };
}

/**
 * PaimaL2 Contract Methods.
 */
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

/**
 * Erc721 Contract Methods.
 */
function erc721Factory(contractAddress: `0x${string}`) {
  return {
    mint: async (
      mint_private_key: `0x${string}`,
      token_id: bigint,
      silent = false,
    ) => {
      const { account, walletClient, publicClient } = clients(mint_private_key);
      if (!silent) {
        console.log("⚡ Minting Token #", token_id, "to", account.address);
      }

      const { request } = await publicClient.simulateContract({
        account,
        // chain: hardhat,
        address: contractAddress,
        abi: erc721abi.abi,
        functionName: "mint",
        args: [
          account.address,
          token_id,
        ],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });
      if (!silent) {
        console.log(
          `  ${
            receipt.status === "success" ? "" : "❌"
          } Mint block ${receipt.blockNumber} @ Hash ${hash}`,
        );
      }
    },
    transfer: async (
      from_private_key: `0x${string}`,
      to_address: `0x${string}`,
      tokenId: bigint,
      silent = false,
    ) => {
      if (!silent) {
        console.log("💸 Transferring Token #", tokenId, "to", to_address);
      }
      const { account, walletClient, publicClient } = clients(from_private_key);
      const { request } = await publicClient.simulateContract({
        account,
        // chain: hardhat,
        address: contractAddress,
        abi: erc721abi.abi,
        functionName: "transferFrom",
        args: [
          account.address,
          to_address,
          tokenId,
        ],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });
      if (!silent) {
        console.log(
          `  ${
            receipt.status === "success" ? "" : "❌"
          } Transfer block ${receipt.blockNumber} @ Hash ${hash}`,
        );
      }
    },
    burn: async (
      from_private_key: `0x${string}`,
      tokenId: bigint,
      silent = false,
    ) => {
      if (!silent) {
        console.log("🔥 Burning Token #", tokenId);
      }
      const { account, walletClient, publicClient } = clients(from_private_key);
      const { request } = await publicClient.simulateContract({
        account,
        // chain: hardhat,
        address: contractAddress,
        abi: erc721abi.abi,
        functionName: "transferFrom",
        args: [
          account.address,
          "0x0000000000000000000000000000000000000000",
          tokenId,
        ],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
      });
      if (!silent) {
        console.log(
          `  ${
            receipt.status === "success" ? "" : "❌"
          } Burn block ${receipt.blockNumber} @ Hash ${hash}`,
        );
      }
    },
  };
}

/**
 * Erc721 Contracts Instances.
 */
export const erc721 = {
  a: erc721Factory(contractAddresses.erc721),
  b: erc721Factory(contractAddresses.erc721_2),
};

/**
 * Erc20 Contract Methods.
 */
export const erc20Factory = (contractAddress: `0x${string}`) => {
  return {
    mint: async (
      mint_address: `0x${string}`,
      mint_private_key: `0x${string}`, // TODO: remove this
      amount: bigint,
      silent = false,
    ) => {
      if (!silent) {
        console.log("⚡ Minting", amount, "to", mint_address);
      }
      const { account, walletClient, publicClient } = clients(mint_private_key);
      const { request } = await publicClient.simulateContract({
        account,
        chain: hardhat,
        address: contractAddress,
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
      if (!silent) {
        console.log(
          `  ${
            receipt.status === "success" ? "" : "❌"
          } Mint block ${receipt.blockNumber} @ Hash ${hash}`,
        );
      }
    },
    transfer: async (
      from_private_key: `0x${string}`,
      to_address: `0x${string}`,
      amount: bigint,
      silent = false,
    ) => {
      if (!silent) {
        console.log("💸 Transferring", amount, "to", to_address);
      }
      const { account, walletClient, publicClient } = clients(from_private_key);
      const { request } = await publicClient.simulateContract({
        account,
        chain: hardhat,
        address: contractAddress,
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
      if (!silent) {
        console.log(
          `  ${
            receipt.status === "success" ? "" : "❌"
          } Transfer block ${receipt.blockNumber} @ Hash ${hash}`,
        );
      }
    },
  };
};

/**
 * Erc20 Contracts Instances.
 */
export const erc20 = {
  a: erc20Factory(contractAddresses.erc20),
  b: erc20Factory(contractAddresses.erc20_2),
};
