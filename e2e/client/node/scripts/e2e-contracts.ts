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
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import {
  contractAddressesEvmMain,
  erc20dev,
  erc721dev,
  paimal2contract,
} from "@e2e/evm-contracts";

import {
  type SharedState,
  updateERC20Balance,
  updateERC721Ownership,
} from "./e2e-shared-state.ts";

const mainEvm = hardhat;
const parallelEvm = JSON.parse(JSON.stringify(hardhat));
parallelEvm.id = 31338;
parallelEvm.rpcUrls.default.http[0] = "http://0.0.0.0:8546";

export const wallets: {
  address: `0x${string}`;
  privateKey: `0x${string}`;
}[] = [{
  address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  privateKey:
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
}, {
  address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  privateKey:
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
}, {
  address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  privateKey:
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
}, {
  address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  privateKey:
    "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
}, {
  address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  privateKey:
    "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
}, {
  address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  privateKey:
    "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
}, {
  address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
  privateKey:
    "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
}, {
  address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
  privateKey:
    "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
}, {
  address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
  privateKey:
    "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
}, {
  address: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
  privateKey:
    "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
}, {
  address: "0xBcd4042DE499D14e55001CcbB24a551F3b954096",
  privateKey:
    "0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897",
}] as const;

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
export const paimaL2Builder = (sharedState: SharedState) => ({
  submitGameInput: async (
    input: string[],
    privateKey: `0x${string}`,
    options?: { updateSharedState?: boolean; waitForReceipt?: boolean },
  ): Promise<`0x${string}`> => {
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
    const waitForReceipt = options?.waitForReceipt ?? true;
    if (waitForReceipt) {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(
        `  ${
          receipt.status === "success" ? "" : "❌"
        } Submit Game Input block ${receipt.blockNumber} @ Hash ${hash}`,
      );
      if (
        (options?.updateSharedState ?? true) && receipt.status === "success"
      ) {
        sharedState.paima_state_machine_counter += 1;
        sharedState.primitive_accounting_counter += 1;

        const address = account.address.toLowerCase();
        let addressExists = sharedState.account_state.unlinkedAddresses.has(
          address,
        );
        if (!addressExists) {
          Object.values(sharedState.account_state.accounts).forEach((a) => {
            if (a.addresses.has(address)) {
              addressExists = true;
            }
          });
        }
        if (!addressExists) {
          sharedState.account_state.unlinkedAddresses.add(address);
        }
      }
    }

    return hash as `0x${string}`;
  },
  waitForReceipts: async (
    hashes: `0x${string}`[],
    privateKey: `0x${string}`,
  ): Promise<void> => {
    const { account, publicClient } = clients(privateKey, mainEvm);
    for (const hash of hashes) {
      await publicClient.waitForTransactionReceipt({ hash });
    }
  },
  setAutomine: async (
    enabled: boolean,
    privateKey: `0x${string}`,
  ): Promise<void> => {
    const { walletClient } = clients(privateKey, mainEvm);
    await (walletClient as any).request({
      method: "evm_setAutomine",
      params: [enabled],
    });
  },
  mineBlock: async (privateKey: `0x${string}`): Promise<void> => {
    const { walletClient } = clients(privateKey, mainEvm);
    await (walletClient as any).request({ method: "evm_mine", params: [] });
  },
});

/**
 * Erc721 Contract Methods.
 */
function erc721Factory(
  contractAddress: `0x${string}`,
  chain: Chain,
  sharedState: SharedState,
) {
  return {
    mint: async (
      mint_private_key: `0x${string}`,
      token_id: bigint,
      silent = false,
      wait = true,
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
      if (wait) {
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
      }

      updateERC721Ownership(sharedState, chain.id, account.address, token_id);
      sharedState.primitive_accounting_counter += 1;
      sharedState.paima_state_machine_counter += 1;
    },
    transfer: async (
      from_private_key: `0x${string}`,
      to_address: `0x${string}`,
      tokenId: bigint,
      silent = false,
      wait = true,
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
      if (wait) {
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
      }

      updateERC721Ownership(sharedState, chain.id, to_address, tokenId);
      sharedState.primitive_accounting_counter += 1;
      sharedState.paima_state_machine_counter += 1;
    },
    burn: async (
      from_private_key: `0x${string}`,
      tokenId: bigint,
      silent = false,
      wait = true,
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
      if (wait) {
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
      }

      updateERC721Ownership(sharedState, chain.id, null, tokenId);
      sharedState.primitive_accounting_counter += 1;
      sharedState.paima_state_machine_counter += 1;
    },
  };
}

/**
 * Erc20 Contract Methods.
 */
export const erc20Factory = (
  contractAddress: `0x${string}`,
  chain: Chain,
  sharedState: SharedState,
) => {
  return {
    mint: async (
      mint_address: `0x${string}`,
      mint_private_key: `0x${string}`, // TODO: remove this
      amount: bigint,
      silent = false,
      wait = true,
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
      if (wait) {
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
      }

      // Update shared state
      updateERC20Balance(sharedState, chain.id, mint_address, amount);

      sharedState.primitive_accounting_counter += 1;
      sharedState.paima_state_machine_counter += 1;
    },
    transfer: async (
      from_private_key: `0x${string}`,
      to_address: `0x${string}`,
      amount: bigint,
      silent = false,
      wait = true,
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
      if (wait) {
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
      }

      // Update shared state
      updateERC20Balance(sharedState, chain.id, to_address, amount);
      updateERC20Balance(sharedState, chain.id, account.address, -amount);

      sharedState.primitive_accounting_counter += 1;
      sharedState.paima_state_machine_counter += 1;
    },
  };
};

/**
 * Erc20 Contracts Instances.
 */
export const erc20Builder = (sharedState: SharedState) => ({
  a: erc20Factory(
    contractAddressesEvmMain()["chain31337"][
      "PaimaErc20DevModule#PaimaErc20Dev"
    ],
    mainEvm,
    sharedState,
  ),
  b: erc20Factory(
    contractAddressesEvmMain()["chain31338"][
      "PaimaErc20DevModule#PaimaErc20Dev"
    ],
    parallelEvm,
    sharedState,
  ),
  id_a: mainEvm.id,
  id_b: parallelEvm.id,
});

/**
 * Erc721 Contracts Instances.
 */
export const erc721Builder = (sharedState: SharedState) => ({
  a: erc721Factory(
    contractAddressesEvmMain()["chain31337"]["Erc721DevModule#Erc721Dev"],
    mainEvm,
    sharedState,
  ),
  b: erc721Factory(
    contractAddressesEvmMain()["chain31338"]["Erc721DevModule#Erc721Dev"],
    parallelEvm,
    sharedState,
  ),
  id_a: mainEvm.id,
  id_b: parallelEvm.id,
});
