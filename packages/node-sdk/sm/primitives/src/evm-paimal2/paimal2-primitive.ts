import { getEvmEvent } from "@paima/config";
import {
  type AddressAndType,
  AddressType,
  type BlockNumber,
  type EvmAddress,
  type PaimaBlockNumber,
  type TxHash,
  TypeboxHelpers,
  type WalletAddress,
} from "@paima/utils";
import { hexToString, stringToHex } from "viem";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  ProtocolPrimitiveMap,
} from "@paima/config";
import type { StateUpdateStream } from "@paima/coroutine";
import {
  findNonce,
  getAddressByAddress,
  insertNonce,
  newAddress,
} from "@paima/db";
import { World } from "@paima/coroutine";
import {
  createMessageForBatcher,
  extractBatches,
  extractDelegateWallet,
  type ExtractedBatchSubunit,
  type GrammarDefinition,
} from "@paima/concise";

import { ComponentNames, log, SeverityNumber } from "@paima/log";
import {
  account_createAccount,
  account_linkAddress,
  account_unlinkAddress,
  verifySignature,
} from "@paima/sm";
import { BuiltinGrammarPrefix } from "@paima/concise";

import { paimal2 } from "./paimal2-abi.ts";
import { type StaticDecode, type TSchema, Type } from "@sinclair/typebox";
import { type JsonObject, PaimaPrimitive } from "@paima/sm";
import { Value } from "@sinclair/typebox/value";
import type { CommandTuple } from "@paima/concise";
import { PrimitiveTypeEVMPaimaL2 } from "../builtin.ts";

export class PaimaL2Primitive extends PaimaPrimitive<
  ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  readonly [string, TSchema][]
> {
  // Primitive defined
  readonly internalTypeName = PrimitiveTypeEVMPaimaL2;
  readonly abi = getEvmEvent(
    paimal2.abi,
    "PaimaGameInteraction(address,bytes,uint256)",
  );
  readonly contractAddress: EvmAddress;
  override grammar = [];
  readonly paimaL2Grammar: GrammarDefinition;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    contractAddress: EvmAddress;
    paimaL2Grammar: GrammarDefinition;
  }) {
    super({ ...config, stateMachinePrefix: undefined });
    this.contractAddress = Value.Decode(
      TypeboxHelpers.Evm.Address,
      config.contractAddress,
    );
    this.paimaL2Grammar = config.paimaL2Grammar;
  }

  override *getPayload(
    paima_block_height: PaimaBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.EVM_RPC_PARALLEL
    >,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<
          CommandTuple<string, any>
        >
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const { data, isBatched } = yield* this.processPaimaL2SyncProtocolResponse(
      paima_block_height,
      primitiveTransactionData,
    );

    const dataPayload = data
      .filter(({ command }) => command)
      .map(({ command, callSTM, fromAddressAndType }) => {
        const concise = JSON.parse(command as string);
        return {
          fromAddressAndType,
          accountingPayload: concise,
          stateMachinePayload: callSTM ? concise : null,
        };
      });

    return {
      isBatched,
      data: dataPayload,
    };
  }

  override getConfig(): ProtocolPrimitiveMap[
    ConfigSyncProtocolType.EVM_RPC_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      contractAddress: this.contractAddress as EvmAddress,
      abi: this.abi,
      // TODO This should be optional.
      scheduledPrefix: this.stateMachinePrefix ?? "",
    } as const;
  }

  private *checkNonce(
    nonce: string | undefined,
    block_height: BlockNumber,
  ): StateUpdateStream<boolean> {
    // TODO This is only for batched messages?
    if (!nonce) return true;

    const [nonceData] = yield* World.resolve(findNonce, { nonce });
    if (nonceData) {
      log.remote(
        ComponentNames.PAIMA_SYNC,
        ["paima-l2"],
        SeverityNumber.INFO,
        (log) =>
          log(
            `Skipping inputData with duplicate nonce: ${nonceData.nonce} at block height: ${nonceData.block_height}`,
          ),
      );
      return false;
    }
    // guarantee we run this no matter if there is an error or a continue
    yield* World.resolve(insertNonce, {
      nonce,
      block_height,
    });

    return true;
  }

  private readonly PrimitiveEvmRpcPaimaL2Payload = Type.Object({
    userAddress: TypeboxHelpers.Evm.Address,
    data: TypeboxHelpers.HexString0x(),
    value: TypeboxHelpers.Uint256,
  });

  private readonly PaimaL2Payload = Type.Object({
    userAddress: Type.String(),
    data: Type.String(),
    value: Type.String({ default: "0" }),
  });

  /**
   * NOTE: if "command" is undefined, it means the input is invalid and must be skipped as it does not exist.
   *       if "callSTM" is false, it means the input is valid, but the contents are invalid, and it will be stored in the accounting, but not processed in the STF.
   */
  private *executePaimaL2Input(input: {
    paima_block_height: PaimaBlockNumber;
    nonce: string | undefined;
    ownChain: {
      blockNumber: BlockNumber;
      transactionHash: TxHash;
    };
    payload: any;
    primitiveName: string;
    signerAddressAndType: AddressAndType;
  }): StateUpdateStream<{
    command: string | undefined;
    callSTM: boolean;
    fromAddressAndType: AddressAndType;
  }> {
    const isNonceValid = yield* this.checkNonce(
      input.nonce,
      input.paima_block_height,
    );
    if (!isNonceValid) {
      return {
        command: undefined,
        callSTM: false,
        fromAddressAndType: input.signerAddressAndType,
      };
    }

    try {
      Value.Decode(this.PaimaL2Payload, input.payload);
    } catch (e) {
      log.remote(
        ComponentNames.PAIMA_SYNC,
        ["paima-l2"],
        SeverityNumber.ERROR,
        (log) =>
          log(
            `Invalid payload: ${e}\nPayload: ${JSON.stringify(input.payload)}`,
          ),
      );
      return {
        command: undefined,
        callSTM: false,
        fromAddressAndType: { type: AddressType.NONE, address: "0x0" },
      };
    }

    // This is encoded in the event payload data.
    // NOTE: We cleanup the null 0x00 bytes, as Postgres does not allow them in strings.
    const inputData = hexToString((input.payload as any).data).replace(
      /\0/g,
      "",
    );

    let [signer_address] = yield* World.resolve(getAddressByAddress, {
      address: input.signerAddressAndType.address,
    });

    if (!signer_address) {
      // Let's insert a new address.
      yield* World.resolve(newAddress, {
        address: input.signerAddressAndType.address,
        address_type: input.signerAddressAndType.type,
      });
      [signer_address] = yield* World.resolve(getAddressByAddress, {
        address: input.signerAddressAndType.address,
      });
    }

    let delegateWalletInputData:
      | ReturnType<typeof extractDelegateWallet>
      | undefined;
    try {
      delegateWalletInputData = extractDelegateWallet(inputData);
    } catch {
      // This is not an error, it's not just a delegate wallet message type.
    }

    if (delegateWalletInputData) {
      try {
        let status = false;
        const delegatePrefix = delegateWalletInputData.prefix;
        switch (delegatePrefix) {
          case BuiltinGrammarPrefix.createAccount:
            status = yield* account_createAccount(
              signer_address,
              delegateWalletInputData,
            );
            break;
          case BuiltinGrammarPrefix.linkAddress:
            status = yield* account_linkAddress(
              signer_address,
              delegateWalletInputData,
            );
            break;
          case BuiltinGrammarPrefix.unlinkAddress:
            status = yield* account_unlinkAddress(
              signer_address,
              delegateWalletInputData,
            );
            break;
        }

        if (!status) {
          log.remote(
            ComponentNames.PAIMA_SYNC,
            ["paima-l2"],
            SeverityNumber.ERROR,
            (log) =>
              log(
                `[paima-sm] Error on Delegate Wallet input STF call. Skipping: ` +
                  delegateWalletInputData,
              ),
          );
          // Do not continue.
          // Unwind is not needed, as this is an format error.
          return {
            command: inputData,
            callSTM: false,
            fromAddressAndType: input.signerAddressAndType,
          };
        }
        // If valid we continue to create a scheduled data,
        // if the developer want to capture it and do something with it.
      } catch (e) {
        // This is not an error, it's not just a delegate wallet message type.
        console.error(
          "Error on Delegate Wallet input STF call. Skipping",
          String(e),
          delegateWalletInputData,
        );
        return {
          command: inputData,
          callSTM: false,
          fromAddressAndType: input.signerAddressAndType,
        };
      }
    }

    console.log(
      "Creating scheduled data for Paima L2 input",
      inputData,
      input.paima_block_height,
      input.primitiveName,
      input.ownChain.transactionHash,
      signer_address.address,
    );

    return {
      command: inputData,
      callSTM: true,
      fromAddressAndType: input.signerAddressAndType,
    };
  }

  private *processPaimaL2SyncProtocolResponse(
    paima_block_height: PaimaBlockNumber,
    response: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.EVM_RPC_PARALLEL
    >,
  ): StateUpdateStream<{
    data: {
      command: string | undefined;
      callSTM: boolean;
      fromAddressAndType: AddressAndType;
    }[];
    isBatched: boolean;
  }> {
    // At this point we have the response from the fetcher, but the payload has not been decoded or transformed.
    const commands: {
      command: string | undefined;
      callSTM: boolean;
      fromAddressAndType: AddressAndType;
    }[] = [];
    const outerLayerData = Value.Decode(
      this.PrimitiveEvmRpcPaimaL2Payload,
      response.output.payload,
    );
    let isBatched = false;
    let batchedMessages: ExtractedBatchSubunit[] = [];
    try {
      const message = hexToString(outerLayerData.data);
      batchedMessages = extractBatches(message);
      isBatched = true;
    } catch {
      // Not batched message
    }
    if (isBatched) {
      for (const batchedMessage of batchedMessages) {
        const { parsed } = batchedMessage;
        const {
          addressType,
          address: userAddress,
          timestamp: millisecondTimestamp,
          signature: userSignature,
          input: conciseInput,
          target: batcherTarget,
        } = parsed;
        // TODO: We need to setup & configure the namespace.
        const message = createMessageForBatcher(
          null,
          millisecondTimestamp,
          userAddress,
          addressType,
          conciseInput,
          batcherTarget,
        );
        // We yield the promise to the generator caller.
        // Sync Generators cannot resolve promises.
        const validSignature = yield* verifySignature(
          addressType,
          userAddress,
          message,
          userSignature,
        );

        // TODO: This is only for EVM at the time.
        //       How should we handle this?
        //       Just guess the chain by the format?
        //       We need to format this, as it's not parsed or validated before.
        let signerAddress: WalletAddress;
        switch (addressType) {
          case AddressType.NONE:
            throw new Error("Invalid address type: " + addressType);
          case AddressType.EVM:
            signerAddress = Value.Decode(
              TypeboxHelpers.Evm.Address,
              userAddress,
            );
            break;
          default:
            signerAddress = userAddress;
            break;
        }

        if (validSignature) {
          commands.push(
            yield* this.executePaimaL2Input({
              paima_block_height,
              nonce: batchedMessage.parsed.address +
                "-" +
                batchedMessage.parsed.timestamp,
              ownChain: {
                blockNumber: response.syncProtocol.blockNumber,
                transactionHash: response.syncProtocol.transactionHash,
              },
              payload: {
                data: stringToHex(batchedMessage.parsed.input),
                userAddress: userAddress as EvmAddress, // This might be a non-EVM address
                value: "0x0",
              },
              primitiveName: response.primitive,
              signerAddressAndType: {
                type: addressType,
                address: signerAddress,
              } as AddressAndType,
            }),
          );
        } else {
          commands.push({
            command: undefined,
            callSTM: false,
            fromAddressAndType: {
              type: addressType,
              address: signerAddress,
            } as AddressAndType,
          });
          log.remote(
            ComponentNames.PAIMA_SYNC,
            ["paima-l2"],
            SeverityNumber.ERROR,
            (log) => log(`Invalid signature for batched message`),
          );
        }
      }
    } else {
      // !isBatched
      commands.push(
        yield* this.executePaimaL2Input({
          paima_block_height,
          // TODO: where do we get the nonce from?
          nonce: undefined,
          ownChain: {
            blockNumber: response.syncProtocol.blockNumber,
            transactionHash: response.syncProtocol.transactionHash,
          },
          payload: outerLayerData,
          primitiveName: response.primitive,
          signerAddressAndType: {
            type: AddressType.EVM,
            // This is a EVM contract, so the signer is always EVM.
            address: outerLayerData.userAddress,
          },
        }),
      );
    }

    return {
      data: commands,
      isBatched,
    };
  }
}

// declare module "@paima/sm" {
//   interface PrimitiveGlobalDefinitions {
//     PaimaL2Primitive: typeof PaimaL2Primitive;
//   }
// }
