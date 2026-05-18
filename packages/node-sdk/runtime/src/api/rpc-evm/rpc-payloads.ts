import {
  encodeFunctionData,
  type RpcBlock,
  type RpcLog,
  type RpcTransaction,
  type RpcTransactionReceipt,
  stringToHex,
} from "viem";
import { add0x } from "./rpc-utils.ts";

export function toRpcTransaction(
  data: {
    blockHash: string;
    blockNumber: number;
    from: string;
    inputData: string;
    txHash: string;
    txIndex: number;
  },
): RpcTransaction {
  const hexMsg = stringToHex(data.inputData);
  /**
   * Paima is not EVM so it doesn't have the same encoding of "inputData" in the EVM sense
   * To convert between the two, we encode the Paima data with this fictional ABI
   */
  const input = encodeFunctionData({
    // TODO: this string should be exposed somewhere 3rd parties can access
    // https://github.com/wevm/viem/issues/2591
    abi: [
      {
        inputs: [{ internalType: "string", name: "input", type: "string" }],
        name: "convertedPaimaData",
        outputs: [],
        stateMutability: "nonpayable",
        type: "function",
      },
    ],
    args: [hexMsg],
  });

  return {
    blockHash: add0x(data.blockHash),
    blockNumber: `0x${data.blockNumber.toString(16)}`,
    hash: add0x(data.txHash),
    input,
    transactionIndex: `0x${data.txIndex.toString(16)}`,
    from: data.from as any, // we can't guarantee EVM address format here
    value: "0x0", // TODO
    nonce: "0x0", // TODO
    ...mockTxType,
    ...mockTxRecipient,
    ...mockTxGasPre,
    ...mockEvmEcdsaSignature,
  };
}

export function toRpcBlock(
  data: {
    blockHeight: number;
    blockHash: string;
    prevBlockHash: string;
    msTimestamp: number;
    txs: ({
      blockHeight: number;
      blockHash: string;
      prevBlockHash: string;
      msTimestamp: number;
      txs: any[];
    } | string)[];
  },
  txDetails: boolean,
): RpcBlock {
  return {
    number: `0x${data.blockHeight.toString(16)}`,
    hash: add0x(data.blockHash),
    parentHash: data.prevBlockHash == null ? "0x0" : add0x(data.prevBlockHash),

    timestamp: `0x${Math.floor(data.msTimestamp / 1000).toString(16)}`,
    size: "0x0", // TODO: do we really need this? I doubt it

    transactions: txDetails
      ? (data
        .txs as any[]).map((tx) => toRpcTransaction(tx))
      : (data.txs as string[]).map((tx) => add0x(tx)),
    ...mockExtraData,
    ...mockRoots,
    ...mockUncles,
    ...mockMiner,
    ...mockBlockGas,
    ...mockLogBloom,
    ...mockSealFields,
    ...mockBlob,
    ...mockEip1559Gas,
  };
}

export function toRpcTransactionReceipt(
  txData: {
    result: {
      txHash: string;
      blockHash: string;
      blockNumber: number;
      txIndex: number;
      from: string;
      success: boolean;
    };
  },
): RpcTransactionReceipt {
  return {
    transactionHash: add0x(txData.result.txHash),
    blockHash: add0x(txData.result.blockHash),
    blockNumber: `0x${txData.result.blockNumber.toString(16)}`,
    transactionIndex: `0x${txData.result.txIndex.toString(16)}`,
    from: txData.result.from as any, // we can't guarantee EVM address format here
    logs: [], // TODO
    status: txData.result.success ? "0x1" : "0x0",
    ...mockTxGasPost,
    ...mockTxRecipient,
    ...mockTxType,
    ...mockLogBloom,
    ...mockContractAddress, // TODO: remove
    // contractAddress: TODO // TODO
  };
}

export function toRpcLog(
  log: any,
): RpcLog {
  return {
    address: log.address as any, // can't guarantee address format matches
    topics: [], // TODO: this should be all topics, not just the ones passed in
    data: "0x", // TODO
    blockNumber: `0x${log.blockNumber.toString(16)}`,
    transactionIndex: add0x(log.txIndex.toString(16)),
    transactionHash: add0x(log.transactionHash),
    blockHash: add0x(log.blockHash),
    logIndex: add0x(log.logIndex.toString(16)),
    removed: false,
  };
}

/**
 * We can't truly provide this for a few reasons:
 * 1. Transactions aren't guaranteed to be on Ethereum (could be from a non-EVM chain)
 * 2. Even on Ethereum, Paima txs aren't guaranteed to be from an EOA accounts
 *    i.e. it could be a game tick, it could be an internal tx (EVM internal txs are regular txs in Paima), etc.
 *
 * TODO: we could decide to add this for historical_game_inputs for EVM chains if we really want to
 */
const mockEvmEcdsaSignature = {
  /** ECDSA signature r */
  r: "0x0",
  /** ECDSA signature s */
  s: "0x0",
  /**
   * ECDSA recovery ID
   * note: replaced by yParity if type != 0x0
   */
  v: "0x0",
} as const;

/**
 * Gas specified before tx lands onchain (as part of the tx input given by the user)
 * Note: no concept of gas on Paima
 */
const mockTxGasPre = {
  gas: "0x0",
  gasPrice: "0x0",
  // TODO: some other gas fields needed if we ever use type != 0x0
} as const;

const mockEip1559Gas = {
  baseFeePerGas: "0x0",
  maxFeePerGas: "0x0",
} as const;

/**
 * Gas specified after tx lands onchain (after calculating how much gas is consumed in reality)
 * Note: no concept of gas on Paima
 */
const mockTxGasPost = {
  gasUsed: "0x0",
  effectiveGasPrice: "0x0",
  cumulativeGasUsed: "0x0",
} as const;
/**
 * Gas consumed for a block
 * Note: no concept of gas on Paima
 */
const mockBlockGas = {
  gasLimit: "0x0",
  gasUsed: "0x0",
} as const;

/**
 * Mock info about blobs (doesn't exist in Paima)
 */
const mockBlob = {
  blobGasUsed: "0x0",
  excessBlobGas: "0x0",
} as const;

/**
 * There is no concept of recipients in Paima since txs are to the state machine
 * TODO: there are some cases where, after processing the STF, we could determine if this tx was *to* a specific address
 *       or conversely, make that the STF fails if the state transition doesn't match some asserted *to* address
 *       so we could support some limited form of this if needed
 */
const mockTxRecipient = {
  to: "0x0",
} as const;

/**
 * EVM has multiple tx types
 * - 0x0 for legacy transactions
 * - 0x1 for access list types
 * - 0x2 for dynamic fees
 *
 * Not all chains use 0x2, so it's not clear which we should use for mock data in Paima
 * Note: making this an ENV var doesn't make sense either since it's not something the node can know ahead of time
 *       since it depends on which tool is making the RPC query, not the node itself
 * We pick 0x0 for best chance at compatibility
 *
 * Note: if we change this to something other than 0x0, we also have to
 * 1. change `v` to `yParity` in the signature
 * 2. change the gas fields
 */
const mockTxType = {
  type: "0x0",
} as const;

/**
 * Theoretically we could implement this in Paima, but it takes time to calculate and basically 0 dApps and tools use this
 * In fact, it's being set to empty-string with an EIP from 2024
 * https://github.com/ethereum/EIPs/blob/master/EIPS/eip-7668.md
 */
const mockLogBloom = {
  // TODO: unclear how this should be handled post-7668, but I assume `0x0` is the right approach
  // https://github.com/wevm/viem/pull/2587
  logsBloom: "0x0",
} as const;

/**
 * This is non-null when the transaction created a new contract
 * However, Paima doesn't support creating new contracts on the L2 side, so it's always null
 * Note: you could argue that maybe we might want this in a few cases:
 *       1. Dynamic primitives (so this would be the address in an underlying chain)
 *       2. Dynamically creating new precompiles
 */
const mockContractAddress = {
  contractAddress: null,
} as const;

/**
 * No concept of miners in Paima (it's a based rollup) nor PoW
 */
const mockMiner = {
  miner: "0x0",
  mixHash: "0x0",
  /** note: `nonce` here isn't a transaction nonce, but rather a nonce for PoW */
  nonce: "0x0",
  difficulty: "0x0",
  totalDifficulty: "0x0",
} as const;

/**
 * No concept of uncles in Paima as we only consider finalized blocks
 */
const mockUncles = {
  sha3Uncles: "0x0" as const,
  uncles: [] as `0x${string}`[],
};

/**
 * Paima, similar to other chains like Solana, does not Merklize state for performance reasons
 * TODO: we could expose this as an ENV var if we really want/need to
 */
const mockRoots = {
  transactionsRoot: "0x0",
  stateRoot: "0x0",
  receiptsRoot: "0x0",
} as const;

/**
 * This has no purpose in Ethereum, but block creators can stuff whatever they want in here
 * No similar concept in Paima, but we could introduce a similar concept in theory when submitting to the L2 contract
 */
const mockExtraData = {
  extraData: "0x0",
} as const;

/**
 * used for Pow, but not used anymore
 */
const mockSealFields = {
  sealFields: ["0x0" as const],
};
