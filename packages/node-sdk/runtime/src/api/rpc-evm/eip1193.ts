import {
  createAsyncMiddleware,
  JsonRpcEngine,
} from "@metamask/json-rpc-engine";
import {
  createInvalidParamsError,
  createMethodNotFoundRpcError,
  createMethodNotSupportedRpcError,
  type EvmRpcReturn,
  type PaimaEvmRpcSchema,
} from "./rpc-types.ts";
import {
  // getBlockByHash,
  getErc20Balance,
  getLatestProcessedBlockHeight,
} from "@paima/db";
import type { Pool } from "pg";
import {
  type EIP1193Parameters,
  isAddress,
  type RpcBlock,
  type RpcError,
  type RpcTransaction,
  toHex,
} from "npm:viem@2.23.10";
import { Buffer } from "node:buffer";
import sha3 from "npm:js-sha3";
import {
  toRpcBlock,
  toRpcLog,
  toRpcTransaction,
  toRpcTransactionReceipt,
} from "./rpc-payloads.ts";
import {
  isValidBlockHash,
  isValidHexadecimal,
  isValidTxHash,
  strip0x,
} from "./rpc-utils.ts";
const { keccak_256 } = sha3;

const ENV = {
  // TODO: Update this
  // 0x145985c1b5
  CHAIN_ID: 87401284021,
};

export function evmRpcEngine(dbConn: Pool): JsonRpcEngine {
  const engine = new JsonRpcEngine();
  // TODO: add cache middleware
  // registerCacheMiddleware(evmRpcEngine);

  /**
   * ===============================
   * JSON-RPC Middleware definitions
   * ===============================
   */

  engine.push(
    createAsyncMiddleware(async (req, res) => {
      const evmRpc: typeof req & EIP1193Parameters<PaimaEvmRpcSchema> =
        req as any;

      const setResult = <Method extends string>(
        result: EvmRpcReturn<Method>,
      ): void => {
        res.result = result as any;
      };

      // TODO: missing these validity checks:
      // - InvalidInputRpcError / InvalidParamsRpcError
      switch (evmRpc.method) {
        /*
         * ==============
         * Gossip methods
         * ==============
         */
        case "eth_blockNumber": {
          const [lastBlockHeight] = await getLatestProcessedBlockHeight.run(
            undefined,
            dbConn,
          );

          setResult<typeof evmRpc.method>(
            `0x${lastBlockHeight.block_height.toString(16)}`,
          );
          return;
        }
        case "eth_sendRawTransaction": {
          // TODO: we can probably support this
          //       but supporting this conversion would have to be a Paima-level feature and not a EVM-RPC feature
          res.error = createMethodNotSupportedRpcError(
            evmRpc.method,
            `${evmRpc.method} currently unsupported`,
          );
          return;
        }

        /**
         * =============
         * State methods
         * =============
         */

        case "eth_getBalance": {
          // TODO: support this eventually somehow
          // res.error = createMethodNotSupportedRpcError(
          //   evmRpc.method,
          //   `${evmRpc.method} currently unsupported`,
          // );
          const [balance] = await getErc20Balance.run({
            address: evmRpc.params[0].toLowerCase(),
          }, dbConn);
          if (!balance) {
            setResult<typeof evmRpc.method>(`0x0`);
          } else {
            setResult<typeof evmRpc.method>(
              `${toHex(BigInt(balance.balance ?? 0))}`,
            );
          }
          return;
        }

        case "eth_getStorageAt": {
          // not possible in Paima Engine at the moment, but maybe in the future related to precompiles
          res.error = createMethodNotSupportedRpcError(
            evmRpc.method,
            `${evmRpc.method} currently unsupported`,
          );
          return;
        }
        case "eth_getTransactionCount": {
          const address = evmRpc.params[0];
          if (!isAddress(address)) {
            res.error = createInvalidParamsError(
              { address },
              `Address is not a valid Ethereum address`,
            );
            return;
          }
          let blockHeight: number;
          // TODO
          // const blockTag = simplifyBlockTag(evmRpc.params[1] ?? "finalized");

          // if (blockParam == "earliest") return FIRST_BLOCK_HEIGHT;
          // if (blockParam == "latest") {
          //   const [lastBlockHeight] = await getLatestProcessedBlockHeight.run(
          //     undefined,
          //     dbConn,
          //   );
          //   blockHeight = lastBlockHeight.block_height;
          // }

          // try {
          //   blockHeight = await toBlockNumber(evmRpc.params[1] ?? "finalized");
          // } catch (err) {
          //   res.error = err as RpcError;
          //   return;
          // }
          // const { data, error } = await getPaimaNodeRestClient().GET(
          //   "/transaction_count/address",
          //   {
          //     params: { query: { blockHeight, address } },
          //   },
          // );
          // if (error != null) {
          //   res.error = createInternalRpcError({}, error?.errorMessage);
          //   return;
          // }
          // if (data.success === false) {
          //   res.error = createInternalRpcError({}, data.errorMessage);
          //   return;
          // }
          setResult<typeof evmRpc.method>(
            `0x${
              Number(0)
                // (data.result.scheduledData + data.result.submittedInputs)
                .toString(
                  16,
                )
            }`,
          );
          return;
        }
        case "eth_getCode": {
          // not possible in Paima Engine at the moment, but maybe in the future related to precompiles
          res.error = createMethodNotSupportedRpcError(
            evmRpc.method,
            `${evmRpc.method} currently unsupported`,
          );
          return;
        }
        case "eth_call": {
          // not possible in Paima Engine at the moment, but maybe in the future related to precompiles
          res.error = createMethodNotSupportedRpcError(
            evmRpc.method,
            `${evmRpc.method} currently unsupported`,
          );
          return;
        }
        case "eth_estimateGas": {
          // no concept of gas in Paima (gas is from the underlying chain)
          setResult<typeof evmRpc.method>(`0x0`);
          return;
        }

        /**
         * ===============
         * History methods
         * ===============
         */

        case "eth_getBlockTransactionCountByHash": {
          const blockHash = evmRpc.params[0];
          if (typeof blockHash !== "string" || !isValidBlockHash(blockHash)) {
            res.error = createInvalidParamsError(
              { blockHash },
              `Needs to be a valid block hash (0x...)`,
            );
            return;
          }
          //     const { data, error } = await getPaimaNodeRestClient().GET(
          //       "/transaction_count/blockHash",
          //       {
          //         params: { query: { blockHash: blockHash } },
          //       },
          //     );
          //     if (error != null) {
          //       res.error = createInternalRpcError({}, error?.errorMessage);
          //       return;
          //     }
          //     if (data.success === false) {
          //       res.error = createInternalRpcError({}, data.errorMessage);
          //       return;
          //     }
          setResult<typeof evmRpc.method>(
            `0x${
              Number(0)
                // (data.result.scheduledData + data.result.submittedInputs)
                .toString(
                  16,
                )
            }`,
          );
          return;
        }
        case "eth_getBlockTransactionCountByNumber": {
          let blockHeight: number;
          // try {
          //   blockHeight = await toBlockNumber(evmRpc.params[0] ?? "finalized");
          // } catch (err) {
          //   res.error = err as RpcError;
          //   return;
          // }
          // const { data, error } = await getPaimaNodeRestClient().GET(
          //   "/transaction_count/blockHeight",
          //   {
          //     params: { query: { blockHeight } },
          //   },
          // );
          // if (error != null) {
          //   res.error = createInternalRpcError({}, error?.errorMessage);
          //   return;
          // }
          // if (data.success === false) {
          //   res.error = createInternalRpcError({}, data.errorMessage);
          //   return;
          // }
          setResult<typeof evmRpc.method>(
            `0x${
              Number(0)
                // (data.result.scheduledData + data.result.submittedInputs)
                .toString(
                  16,
                )
            }`,
          );
          return;
        }
        case "eth_getUncleCountByBlockHash": {
          setResult<typeof evmRpc.method>(`0x0`); // no uncles in Paima
          return;
        }
        case "eth_getUncleCountByBlockNumber": {
          setResult<typeof evmRpc.method>(`0x0`); // no uncles in Paima
          return;
        }
        case "eth_getBlockByHash": {
          const blockHash = evmRpc.params[0];
          if (typeof blockHash !== "string" || !isValidBlockHash(blockHash)) {
            res.error = createInvalidParamsError(
              { blockHash },
              `Needs to be a valid block hash (0x...)`,
            );
            return;
          }

          const transactionDetails = evmRpc.params[1];
          if (typeof transactionDetails !== "boolean") {
            res.error = createInvalidParamsError(
              { transactionDetails },
              `Transaction details must be specified as a boolean`,
            );
            return;
          }

          const [block] = await getLatestProcessedBlockHeight.run(
            undefined,
            // { block_hash: Buffer.from(blockHash.slice(2), "hex") },
            dbConn,
          );

          if (!block) {
            res.error = createInvalidParamsError(
              { blockHash },
              `Block not found`,
            );
            return;
          }
          //     const { data, error } = await getPaimaNodeRestClient().GET(
          //       "/block_content/blockHash",
          //       {
          //         params: {
          //           query: {
          //             blockHash,
          //             txDetails: transactionDetails ? "full" : "hash",
          //           },
          //         },
          //       },
          //     );
          //     if (error != null) {
          //       res.error = createInternalRpcError({}, error?.errorMessage);
          //       return;
          //     }
          //     if (data.success === false) {
          //       res.error = createInternalRpcError({}, data.errorMessage);
          //       return;
          //     }
          const randomBlockHash = (): string =>
            "0x" +
            Array(64).fill(0).map(() =>
              Math.floor(Math.random() * 16).toString(16)
            ).join("");
          const mockInput = {
            blockHeight: 0, // block.block_height,
            blockHash: randomBlockHash(),
            prevBlockHash: randomBlockHash(),
            msTimestamp: Date.now(),
            txs: [],
          };
          const mock: RpcBlock = toRpcBlock(mockInput, transactionDetails);
          setResult<typeof evmRpc.method>(mock);
          return;
        }
        case "eth_getBlockByNumber": {
          let blockHeight: number;
          let block;
          try {
            // TODO this should be dynamic
            // TOOD for now just passing the block
            const [block_] = await getLatestProcessedBlockHeight.run(
              undefined,
              dbConn,
            );
            block = block_;
            blockHeight = block.block_height;
            // blockHeight = await toBlockNumber(evmRpc.params[0] ?? "finalized");
          } catch (err) {
            res.error = err as RpcError;
            return;
          }

          const transactionDetails = evmRpc.params[1];
          if (typeof transactionDetails !== "boolean") {
            res.error = createInvalidParamsError(
              { transactionDetails },
              `Transaction details must be specified as a boolean`,
            );
            return;
          }

          // const { data, error } = await getPaimaNodeRestClient().GET(
          //       "/block_content/blockHeight",
          //       {
          //         params: {
          //           query: {
          //             blockHeight,
          //             txDetails: transactionDetails ? "full" : "hash",
          //           },
          //         },
          //       },
          //     );
          //     if (error != null) {
          //       res.error = createInternalRpcError({}, error?.errorMessage);
          //       return;
          //     }
          //     if (data.success === false) {
          //       res.error = createInternalRpcError({}, data.errorMessage);
          //       return;
          //     }

          // example: 0x1e888a0eadd622fe55b53692139e64f23852b247060fcb31322c3a76b265e760
          const randomBlockHash = (): string =>
            "0x" +
            Array(64).fill(0).map(() =>
              Math.floor(Math.random() * 16).toString(16)
            ).join("");
          const mockInput = {
            blockHeight: block.block_height,
            blockHash: randomBlockHash(),
            prevBlockHash: randomBlockHash(),
            msTimestamp: Date.now(),
            txs: [],
          };
          const mock: RpcBlock = toRpcBlock(mockInput, transactionDetails);
          setResult<typeof evmRpc.method>(mock);
          return;
        }
        case "eth_getTransactionByHash": {
          const txHash = evmRpc.params[0];
          if (!isValidTxHash(txHash)) {
            res.error = createInvalidParamsError(
              { txHash },
              `Transaction hash did not match EVM format: ${txHash}`,
            );
            return;
          }
          // TODO
          //     const { data, error } = await getPaimaNodeRestClient().GET(
          //       "/transaction_content/txHash",
          //       {
          //         params: { query: { txHash } },
          //       },
          //     );
          //     if (error != null) {
          //       res.error = createInternalRpcError({}, error?.errorMessage);
          //       return;
          //     }
          //     if (data.success === false) {
          //       res.error = createInternalRpcError({}, data.errorMessage);
          //       return;
          //     }
          const [block] = await getLatestProcessedBlockHeight.run(
            undefined,
            dbConn,
          );
          if (!block) {
            res.error = createInvalidParamsError(
              { txHash },
              `Block not found`,
            );
            return;
          }
          const randomBlockHash = (): string =>
            "0x" +
            Array(64).fill(0).map(() =>
              Math.floor(Math.random() * 16).toString(16)
            ).join("");
          const mockInput = {
            blockHash: randomBlockHash(),
            blockNumber: block.block_height,
            from: randomBlockHash(),
            inputData: "hello",
            txHash: txHash,
            txIndex: 0,
          };
          const mock: RpcTransaction = toRpcTransaction(mockInput);
          setResult<typeof evmRpc.method>(mock);
          return;
        }
        case "eth_getTransactionByBlockHashAndIndex": {
          const blockHash = evmRpc.params[0];
          if (typeof blockHash !== "string" || !isValidBlockHash(blockHash)) {
            res.error = createInvalidParamsError(
              { blockHash },
              `Needs to be a valid block hash (0x...)`,
            );
            return;
          }
          //     const txIndex = Number.parseInt(evmRpc.params[1], 16);
          //     if (typeof txIndex !== "number") {
          //       res.error = createInvalidParamsError(
          //         { txIndex },
          //         `Transaction index must be specified as a number`,
          //       );
          //       return;
          //     }

          //     const { data, error } = await getPaimaNodeRestClient().GET(
          //       "/transaction_content/blockHashAndIndex",
          //       { params: { query: { blockHash, txIndex } } },
          //     );
          //     if (error != null) {
          //       res.error = createInternalRpcError({}, error?.errorMessage);
          //       return;
          //     }
          //     if (data.success === false) {
          //       res.error = createInternalRpcError({}, data.errorMessage);
          //       return;
          //     }
          const [block] = await getLatestProcessedBlockHeight.run(
            undefined,
            dbConn,
          );
          const randomBlockHash = (): string =>
            "0x" +
            Array(64).fill(0).map(() =>
              Math.floor(Math.random() * 16).toString(16)
            ).join("");
          const mockInput = {
            blockHash: randomBlockHash(),
            blockNumber: block.block_height,
            from: randomBlockHash(),
            inputData: randomBlockHash(),
            txHash: randomBlockHash(),
            txIndex: 0,
          };
          const mock = toRpcTransaction(mockInput);
          setResult<typeof evmRpc.method>(mock);
          return;
        }
        case "eth_getTransactionByBlockNumberAndIndex": {
          let blockHeight: number;
          try {
            const [block] = await getLatestProcessedBlockHeight.run(
              undefined,
              dbConn,
            );
            blockHeight = block.block_height;
            // blockHeight = await toBlockNumber(evmRpc.params[0]);
          } catch (err) {
            res.error = err as RpcError;
            return;
          }
          const txIndex = Number.parseInt(evmRpc.params[1], 16);
          if (typeof txIndex !== "number") {
            res.error = createInvalidParamsError(
              { txIndex },
              `Transaction index must be specified as a number`,
            );
            return;
          }

          //     const { data, error } = await getPaimaNodeRestClient().GET(
          //       "/transaction_content/blockNumberAndIndex",
          //       { params: { query: { blockHeight, txIndex } } },
          //     );
          //     if (error != null) {
          //       res.error = createInternalRpcError({}, error?.errorMessage);
          //       return;
          //     }
          //     if (data.success === false) {
          //       res.error = createInternalRpcError({}, data.errorMessage);
          //       return;
          //     }
          const [block] = await getLatestProcessedBlockHeight.run(
            undefined,
            dbConn,
          );
          const randomBlockHash = (): string =>
            "0x" +
            Array(64).fill(0).map(() =>
              Math.floor(Math.random() * 16).toString(16)
            ).join("");
          const mockInput = {
            blockHash: randomBlockHash(),
            blockNumber: block.block_height,
            from: randomBlockHash(),
            inputData: randomBlockHash(),
            txHash: randomBlockHash(),
            txIndex: 0,
          };
          const mock = toRpcTransaction(mockInput);
          setResult<typeof evmRpc.method>(mock);
          return;
        }
        case "eth_getLogs": {
          const request = evmRpc.params[0];

          let fromBlock: number;
          let toBlock: number;
          //     if (request.blockHash) {
          //       if (
          //         typeof request.blockHash !== "string" ||
          //         !isValidBlockHash(request.blockHash)
          //       ) {
          //         res.error = createInvalidParamsError(
          //           { blockHash: request.blockHash },
          //           `Needs to be a valid block hash (0x...)`,
          //         );
          //         return;
          //       }
          //       const { data, error } = await getPaimaNodeRestClient().GET(
          //         "/block_content/blockHash",
          //         {
          //           params: {
          //             query: { blockHash: request.blockHash, txDetails: "none" },
          //           },
          //         },
          //       );
          //       if (error != null) {
          //         res.error = createInternalRpcError({}, error?.errorMessage);
          //         return;
          //       }
          //       if (data.success === false) {
          //         res.error = createInternalRpcError({}, data.errorMessage);
          //         return;
          //       }

          //       fromBlock = data.result.blockHeight;
          //       toBlock = data.result.blockHeight;
          //     } else {
          //       try {
          //         fromBlock = await toBlockNumber(request.fromBlock ?? "latest");
          //       } catch (err) {
          //         res.error = err as RpcError;
          //         return;
          //       }
          //       try {
          //         toBlock = await toBlockNumber(request.toBlock ?? "latest");
          //       } catch (err) {
          //         res.error = err as RpcError;
          //         return;
          //       }
          //     }

          // const filterFields: Partial<
          //   Pick<
          //     PaimaNodeRestComponents["schemas"]["GetLogsParams"],
          //     "filters" | "topic"
          //   >
          // > = {};
          //     if (request.topics != null && request.topics.length > 0) {
          //       // https://ethereum.stackexchange.com/a/107326/140076
          //       // problem: how do we know if something is an address, or a string that happens to be the same length?
          //       const [topicHash, ...data] = request.topics;
          //       filterFields.topic = strip0x(topicHash as string);

          //       // we need to map any other data provided from EVM format to Paima format
          //       if (data.length > 0) {
          //         const eventDefinition = (():
          //           | undefined
          //           | RegisteredEvent<LogEvent<LogEventFields<TSchema>[]>> => {
          //           const appEvents = EngineService.INSTANCE.getSM().getAppEvents();

          //           for (const defs of Object.values(appEvents)) {
          //             for (const def of defs) {
          //               if (def.topicHash === filterFields.topic) {
          //                 return def;
          //               }
          //             }
          //           }

          //           return undefined;
          //         })();

          //         // if no event is found for this topic, we can just return right away
          //         // note: EVM RPCs also do not return an error for not-found topics, as they may be registered later
          //         if (eventDefinition == null) {
          //           setResult<typeof evmRpc.method>([]);
          //           return;
          //         }

          //         const eventPaths = eventDefinition.path as EventPath;
          //         const evmAbi = toEvmAbi(eventDefinition.definition);
          //         if (evmAbi == null) {
          //           res.error = createInternalRpcError(
          //             {},
          //             `EVM ABI conversion for this event type is not supported`,
          //           );
          //           return;
          //         }
          //         for (let i = 0, j = 0; i < data.length; i++) {
          //           const topic = data[i];
          //           if (topic == null) continue;
          //           if (Array.isArray(topic)) {
          //             res.error = createInvalidParamsError(
          //               { topic },
          //               `Array-style OR topics unsupported at the moment`,
          //             );
          //             return;
          //           }
          //           let nextFilter: undefined | ArgPath = undefined;
          //           // increase `j` to the index of the next filter for this event
          //           for (; j < eventPaths.length; j++) {
          //             let path = eventPaths[j];
          //             if (typeof path !== "string") {
          //               nextFilter = path;
          //               break;
          //             }
          //           }
          //           // no fields left (there are more event RPC filters specified than fields for this event)
          //           if (nextFilter == null) {
          //             break;
          //           }
          //           const filter = eventPaths[j] as ArgPath;

          //           if (filterFields.filters == null) {
          //             filterFields.filters = {};
          //           }
          //           filterFields.filters[filter.name] = decodeAbiParameters(
          //             [evmAbi[i]],
          //             topic,
          //           )[0] as string;
          //         }
          //       }
          //     }

          //     const { data, error } = await getPaimaNodeRestClient().POST(
          //       "/get_logs",
          //       {
          //         body: {
          //           fromBlock,
          //           toBlock,
          //           ...filterFields,
          //           address: request.address,
          //         },
          //       },
          //     );
          //     if (error != null) {
          //       res.error = createInternalRpcError({}, error?.errorMessage);
          //       return;
          //     }
          //     if (data.success === false) {
          //       res.error = createInternalRpcError({}, data.errorMessage);
          //       return;
          //     }

          setResult<typeof evmRpc.method>([].map(toRpcLog));
          return;
        }
        case "eth_getTransactionReceipt": {
          const txHash = evmRpc.params[0];
          if (!isValidTxHash(txHash)) {
            res.error = createInvalidParamsError(
              { txHash },
              `Transaction hash did not match EVM format: ${txHash}`,
            );
            return;
          }

          //     const { data: txData, error: txError } = await getPaimaNodeRestClient()
          //       .GET(
          //         "/transaction_content/txHash",
          //         {
          //           params: { query: { txHash } },
          //         },
          //       );
          //     if (txError != null) {
          //       res.error = createInternalRpcError({}, txError?.errorMessage);
          //       return;
          //     }
          //     if (txData.success === false) {
          //       res.error = createInternalRpcError({}, txData.errorMessage);
          //       return;
          //     }

          //     // TODO: create a version of get_logs for specific transactions

          const [block] = await getLatestProcessedBlockHeight.run(
            undefined,
            dbConn,
          );

          if (!block) {
            res.error = createInvalidParamsError(
              { txHash },
              `Block not found`,
            );
            return;
          }

          const randomBlockHash = (): string =>
            "0x" +
            Array(64).fill(0).map(() =>
              Math.floor(Math.random() * 16).toString(16)
            ).join("");

          const mockInput = {
            result: {
              txHash: randomBlockHash(),
              blockHash: randomBlockHash(),
              blockNumber: block.block_height,
              txIndex: 0,
              from: randomBlockHash(),
              success: true,
            },
          };
          setResult<typeof evmRpc.method>(toRpcTransactionReceipt(mockInput));
          return;
        }
        case "eth_getUncleByBlockHashAndIndex": {
          setResult<typeof evmRpc.method>(null); // no uncles in Paima
          return;
        }
        case "eth_getUncleByBlockNumberAndIndex": {
          setResult<typeof evmRpc.method>(null); // no uncles in Paima
          return;
        }

        //   /**
        //    * ===============
        //    * Other methods
        //    * ===============
        //    */

        case "web3_clientVersion": {
          // TODO: should include the following
          // 1: commit hash somehow
          // 2: platform
          // 3: node version
          // example of Geth: Geth/v1.9.15-stable-0f77f34b/linux-amd64/go1.14.4"
          // we just keep it simple for now
          // TODO: UPDATE THIS
          setResult<typeof evmRpc.method>(
            `PaimaEngine/v0.0.1`,
          );
          return;
        }
        case "web3_sha3": {
          const data = evmRpc.params[0];
          if (typeof data !== "string" || !isValidHexadecimal(strip0x(data))) {
            res.error = createInvalidParamsError(
              { data },
              `Data must be a hex-encoded string 0x...`,
            );
            return;
          }
          // web3_sha3 passes the data as a hex-string, so we need to convert it
          const buffer = Buffer.from(strip0x(data), "hex");

          setResult<typeof evmRpc.method>(`0x${keccak_256(buffer as any)}`);
          return;
        }
        case "net_version": {
          // net_version is an older version of eth_chainId that predates the ETC hardfork
          // eth_chainId should always be used instead, but net_version===eth_chainId in almost all networks
          // the only real notable exception being ETC where these values are not equal
          // learn more: https://medium.com/@pedrouid/chainid-vs-networkid-how-do-they-differ-on-ethereum-eec2ed41635b
          setResult<typeof evmRpc.method>(`0x${ENV.CHAIN_ID.toString(16)}`);
          return;
        }
        case "net_listening": {
          // note: depending on your interpretation,
          //       this should one of
          //       A) always return true (is the server online at all)
          //       B) Only return true if this RPC should be used by others (is one RPC better than another)
          //       C) Can you sync blocks from connecting to this node
          //       ex: in wagmi, it's used to rank multiple RPCs and it prioritizes RPCs that return true
          setResult<typeof evmRpc.method>(true); // maybe this should be ENV.SERVER_ONLY_MODE
          return;
        }
        case "net_peerCount": {
          // todo: theoretically we could support this based on MQTT connections or something similar, but it's not worth it
          setResult<typeof evmRpc.method>(`0x0`);
          return;
        }
        case "eth_gasPrice": {
          // no concept of gas in Paima (gas is from the underlying chain)
          setResult<typeof evmRpc.method>(`0x0`);
          return;
        }
        case "eth_chainId": {
          // TODO: this is not a great thing to return, since every game is its own chain. Not sure what to do about this
          //       maybe the hash of the game name or something?
          setResult<typeof evmRpc.method>(`0x${ENV.CHAIN_ID.toString(16)}`);
          return;
        }

        case "eth_syncing": {
          // if (ENV.SERVER_ONLY_MODE) {
          //   setResult<typeof evmRpc.method>(false);
          // }
          // const { data, error } = await getPaimaNodeRestClient().GET(
          //   "/latest_processed_blockheight",
          // );
          // if (error != null) {
          //   res.error = createInternalRpcError({}, error?.errorMessage);
          //   return;
          // }

          const [block] = await getLatestProcessedBlockHeight.run(
            undefined,
            dbConn,
          );

          // TODO Updaste this
          const ENV_START_BLOCKHEIGHT = 0;
          setResult<typeof evmRpc.method>({
            startingBlock: `0x${ENV_START_BLOCKHEIGHT.toString(16)}`,
            currentBlock: `0x${block.block_height.toString(16)}`,
          });
          return;
        }

        default: {
          res.error = createMethodNotFoundRpcError(evmRpc.method);
        }
      }
    }),
  );

  return engine;
}
