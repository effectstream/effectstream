import { Type } from "@sinclair/typebox";

export const midnightContractEventGrammar = [
  ["eventIdentity", Type.String()],
  ["eventId", Type.Number()],
  ["maxEventId", Type.Number()],
  ["eventVersion", Type.Number()],
  ["protocolVersion", Type.Number()],
  ["contractAddress", Type.String()],
  ["indexerTransactionId", Type.Number()],
  ["transactionHash", Type.String()],
  ["blockHash", Type.String()],
  ["blockHeight", Type.Number()],
  ["eventType", Type.String()],
  ["raw", Type.String()],
  ["fields", Type.String()],
] as const;
