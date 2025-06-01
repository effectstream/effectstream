import { syncProtocolResponsesAlgorand } from "./algorand/rpc.ts";
import { syncProtocolResponsesAvail } from "./avail/rpc.ts";
import { syncProtocolResponsesCardanoCarp } from "./cardano/carp.ts";
import { syncProtocolResponsesCardanoUtxorpc } from "./cardano/utxorpc.ts";
import { syncProtocolResponsesEvmRpc } from "./evm/rpc.ts";
import { syncProtocolResponsesMidnight } from "./midnight/graphql.ts";
import { syncProtocolResponsesMina } from "./mina/graphql.ts";

export const PrimitiveToDatum = {
  ...syncProtocolResponsesAlgorand,
  ...syncProtocolResponsesAvail,
  ...syncProtocolResponsesCardanoCarp,
  ...syncProtocolResponsesCardanoUtxorpc,
  ...syncProtocolResponsesEvmRpc,
  ...syncProtocolResponsesMina,
  ...syncProtocolResponsesMidnight,
} as const;
