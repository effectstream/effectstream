import { doLog, type EvmAddress } from "@paima/utils";
import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";
import {
  createScheduledData,
  primitiveErc721BurnInsert,
  primitiveErc721Delete,
  primitiveErc721GetOwner,
  primitiveErc721InsertOwner,
  primitiveErc721UpdateOwner,
} from "@paima/db";
import type { StateUpdateStream } from "@paima/coroutine";
import { World } from "@paima/coroutine";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import { ConfigPrimitiveType } from "@paima/config";

export default function* processErc721SyncProtocolResponse(
  response: FlattenSyncProtocolIOFor<
    | ConfigSyncProtocolType.EVM_RPC_MAIN
    | ConfigSyncProtocolType.EVM_RPC_PARALLEL,
    ConfigPrimitiveType.EvmRpcERC721,
    ConfigPrimitivePayloadType.Transfer
  >,
): StateUpdateStream<void> {
  const primitiveName = response.output.syncProtocol.payload.primitiveName;
  const { to, tokenId, from } = response.output.payload;
  const toAddr = to.toLowerCase();

  const isBurn = Boolean(toAddr.toLocaleLowerCase().match(/^0x0+(dead)?$/g));

  try {
    const ownerRow = yield* World.resolve(primitiveErc721GetOwner, {
      primitive_name: primitiveName,
      token_id: tokenId.toString(),
    });
    const newOwnerData = {
      primitive_name: primitiveName,
      token_id: tokenId.toString(),
      nft_owner: toAddr,
    };
    if (ownerRow.length > 0) {
      if (isBurn) {
        if (response.input.burnScheduledPrefix) {
          const scheduledInputData = generateRawStmInput(
            BuiltinTransitions[ConfigPrimitiveType.ERC721].burnScheduledPrefix,
            response.input.burnScheduledPrefix,
            {
              owner: ownerRow[0].nft_owner as EvmAddress,
              tokenId,
            },
          );

          const scheduledBlockHeight =
            response.output.syncProtocol.payload.mainchain.blockNumber;

          yield* createScheduledData(
            JSON.stringify(scheduledInputData),
            { blockHeight: scheduledBlockHeight },
            {
              primitiveName: response.output.syncProtocol.payload.primitiveName,
              txHash: response.output.syncProtocol.payload.transactionHash,
              caip2: response.output.syncProtocol.payload.caip2,
              fromAddress: from.toLowerCase(),
              contractAddress: response.input.contractAddress.toLowerCase(),
            },
          );
        }

        // we do this to keep track of the owner before the asset is sent to the
        // burn address
        yield* World.resolve(primitiveErc721BurnInsert, {
          primitive_name: primitiveName,
          token_id: tokenId.toString(),
          nft_owner: ownerRow[0].nft_owner,
        });
        yield* World.resolve(primitiveErc721Delete, {
          primitive_name: primitiveName,
          token_id: tokenId.toString(),
        });
      } else {
        yield* World.resolve(primitiveErc721UpdateOwner, newOwnerData);
      }
    } else {
      yield* World.resolve(primitiveErc721InsertOwner, newOwnerData);
    }
  } catch (err) {
    doLog(`[paima-sm] error while processing erc721 datum: ${err}`);
  }
}
