import { Type } from "@sinclair/typebox";

export const bitcoinAddressGrammar = [
  ["direction", Type.Union([
    Type.Literal("input"),
    Type.Literal("output"),
  ])],
  ["address", Type.String()],
  ["transactionId", Type.String()],
  ["index", Type.Number()],
  ["valueSats", Type.Number()],
  ["utxoTxid", Type.String()],
  ["utxoVout", Type.Number()],
  ["label", Type.Optional(Type.String())],
] as const;

