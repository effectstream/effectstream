import { syncProtocolResponsesAlgorand } from "./algorand.ts";
import { syncProtocolResponsesAvail } from "./avail.ts";
import { syncProtocolResponsesCardano } from "./cardano.ts";
import { syncProtocolResponsesEvm } from "./evm.ts";
import { syncProtocolResponsesMidnight } from "./midnight.ts";
import { syncProtocolResponsesMina } from "./mina.ts";

export const PrimitiveToDatum = {
  ...syncProtocolResponsesAlgorand,
  ...syncProtocolResponsesAvail,
  ...syncProtocolResponsesCardano,
  ...syncProtocolResponsesEvm,
  ...syncProtocolResponsesMina,
  ...syncProtocolResponsesMidnight,
} as const;
