import { syncProtocolResponsesAlgorand } from "./algorand.ts";
import { syncProtocolResponsesAvail } from "./avail.ts";
import { syncProtocolResponsesCardanoCarp } from "./cardano/carp.ts";
import { syncProtocolResponsesCardanoUtxorpc } from "./cardano/utxorpc.ts";
import { syncProtocolResponsesEvmRpc } from "./evm/rpc.ts";
import { syncProtocolResponsesMidnight } from "./midnight.ts";
import { syncProtocolResponsesMina } from "./mina.ts";

export const PrimitiveToDatum = {
  ...syncProtocolResponsesAlgorand,
  ...syncProtocolResponsesAvail,
  ...syncProtocolResponsesCardanoCarp,
  ...syncProtocolResponsesCardanoUtxorpc,
  ...syncProtocolResponsesEvmRpc,
  ...syncProtocolResponsesMina,
  ...syncProtocolResponsesMidnight,
} as const;
