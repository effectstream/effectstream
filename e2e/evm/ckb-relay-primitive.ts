import {
  ConfigSyncProtocolType,
  type FlattenSyncProtocolIOFor,
  type ProtocolPrimitiveMap,
} from "@effectstream/config";
import { AddressType, type AddressAndType, type EffectstreamBlockNumber } from "@effectstream/utils";
import { Primitive, type JsonObject } from "@effectstream/sm";
import type { StateUpdateStream } from "@effectstream/coroutine";

export const CKB_RELAY_PRIMITIVE_NAME = "CkbCellCreated";
export const CKB_RELAY_PRIMITIVE_TYPE = "CKB:CELL-CREATED";

export class CkbRelayPrimitive extends Primitive<ConfigSyncProtocolType.CKB_RPC_PARALLEL, []> {
  readonly internalTypeName = CKB_RELAY_PRIMITIVE_TYPE as any;
  override grammar = [] as [];

  constructor(config: { instanceName: string; startBlockHeight: number; stateMachinePrefix?: string }) {
    super({ ...config, stateMachinePrefix: undefined });
  }

  override *getPayload(
    _height: EffectstreamBlockNumber,
    primitiveData: FlattenSyncProtocolIOFor<ConfigSyncProtocolType.CKB_RPC_PARALLEL>,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: { fromAddressAndType: AddressAndType; stateMachinePayload: null; accountingPayload: JsonObject }[];
  }> {
    const event = primitiveData.output.payload as unknown as JsonObject;
    return {
      isBatched: false,
      data: [{
        fromAddressAndType: { type: AddressType.NONE, address: "0x0" },
        stateMachinePayload: null,
        accountingPayload: event,
      }],
    };
  }

  override getConfig(): ProtocolPrimitiveMap[ConfigSyncProtocolType.CKB_RPC_PARALLEL] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
    } as ProtocolPrimitiveMap[ConfigSyncProtocolType.CKB_RPC_PARALLEL];
  }
}

export const CKB_RELAY_SYNC_PROTOCOL = "ckbRelayEvents";
