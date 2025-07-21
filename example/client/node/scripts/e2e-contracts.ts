import {
  type Account,
  type Chain,
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
  contractAddressesEvmMain,
  erc20dev,
  erc721dev,
  paimal2contract,
} from "@example/evm-contracts";

const mainEvm = hardhat;
const parallelEvm = JSON.parse(JSON.stringify(hardhat));
parallelEvm.id = 31338;
parallelEvm.rpcUrls.default.http[0] = "http://0.0.0.0:8546";

/**
 * Deploy the contracts.
 * TODO: This will be deployed by the engine.
 */
export async function deployContracts(): Promise<void> {
}

/**
 * Create a viem client.
 * @param privateKey - The private key of the account.
 * @returns The account, wallet client and public client.
 */
function clients(privateKey: `0x${string}`, chain: Chain): {
  account: Account;
  walletClient: WalletClient;
  publicClient: PublicClient;
} {
  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(),
  });
  const publicClient = createPublicClient({
    chain,
    transport: http(),
  });
  return { account, walletClient, publicClient };
}

/**
 * PaimaL2 Contract Methods.
 */
export const paimaL2Builder = () => ({
  submitGameInput: async (
    input: string[],
    privateKey: `0x${string}`,
  ): Promise<void> => {
    console.log("🎮 Submitting game input", input);
    const { account, walletClient, publicClient } = clients(
      privateKey,
      mainEvm,
    );
    const hash = await walletClient.writeContract({
      account,
      chain: mainEvm,
      address: contractAddressesEvmMain()["chain31337"][
        "PaimaL2ContractModule#MyPaimaL2Contract"
      ],
      abi: paimal2contract.metadata.output.abi,
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
});

/**
 * Erc721 Contract Methods.
 */
function erc721Factory(contractAddress: `0x${string}`, chain: Chain) {
  return {
    mint: async (
      mint_private_key: `0x${string}`,
      token_id: bigint,
      silent = false,
    ) => {
      const { account, walletClient, publicClient } = clients(
        mint_private_key,
        chain,
      );
      if (!silent) {
        console.log("⚡ Minting Token #", token_id, "to", account.address);
      }

      const { request } = await publicClient.simulateContract({
        account,
        chain,
        address: contractAddress,
        abi: erc721dev.abi,
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
      const { account, walletClient, publicClient } = clients(
        from_private_key,
        chain,
      );
      const { request } = await publicClient.simulateContract({
        account,
        chain,
        address: contractAddress,
        abi: erc721dev.abi,
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
      const { account, walletClient, publicClient } = clients(
        from_private_key,
        chain,
      );
      const { request } = await publicClient.simulateContract({
        account,
        chain,
        address: contractAddress,
        abi: erc721dev.abi,
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
 * Erc20 Contract Methods.
 */
export const erc20Factory = (contractAddress: `0x${string}`, chain: Chain) => {
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
      const { account, walletClient, publicClient } = clients(
        mint_private_key,
        chain,
      );
      const { request } = await publicClient.simulateContract({
        account,
        chain,
        address: contractAddress,
        abi: erc20dev.abi,
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
      const { account, walletClient, publicClient } = clients(
        from_private_key,
        chain,
      );
      const { request } = await publicClient.simulateContract({
        account,
        chain,
        address: contractAddress,
        abi: erc20dev.abi,
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
export const erc20Builder = () => ({
  a: erc20Factory(
    contractAddressesEvmMain()["chain31337"][
      "PaimaErc20DevModule#PaimaErc20Dev"
    ],
    mainEvm,
  ),
  b: erc20Factory(
    contractAddressesEvmMain()["chain31338"][
      "PaimaErc20DevModule#PaimaErc20Dev"
    ],
    parallelEvm,
  ),
});

/**
 * Erc721 Contracts Instances.
 */
export const erc721Builder = () => ({
  a: erc721Factory(
    contractAddressesEvmMain()["chain31337"]["Erc721DevModule#Erc721Dev"],
    mainEvm,
  ),
  b: erc721Factory(
    contractAddressesEvmMain()["chain31338"]["Erc721DevModule#Erc721Dev"],
    parallelEvm,
  ),
});
