import type { Fixed64, IAnyValue } from "./typebox.ts";
import { Buffer } from "node:buffer";

export function otelStringify(value: undefined | IAnyValue): string {
  if (value === undefined) return "";
  if ("stringValue" in value) {
    return JSON.stringify(value.stringValue ?? "");
  }
  if ("boolValue" in value) {
    return (value.boolValue ?? false).toString();
  }
  if ("intValue" in value) {
    return (value.intValue ?? 0).toString();
  }
  if ("doubleValue" in value) {
    return (value.doubleValue ?? 0).toString();
  }
  if ("arrayValue" in value) {
    return `[${value.arrayValue?.values.map(otelStringify).join(", ") ?? ""}]`;
  }
  if ("kvlistValue" in value) {
    return `{${
      value.kvlistValue?.values.map((kv) =>
        `${kv.key}: ${otelStringify(kv.value)}`
      ).join(", ") ?? ""
    }}`;
  }
  if ("bytesValue" in value) {
    return Buffer.from(value.bytesValue?.toString() ?? "").toString("hex");
  }
  if ("value" in value) {
    return JSON.stringify(value.value);
  }
  return JSON.stringify(value); // this should never happen
}

export function parseFixed64(value: Fixed64): bigint {
  if (typeof value === "string" || typeof value === "number") {
    return BigInt(value);
  }
  const low = BigInt(value.low);
  const high = BigInt(value.high);
  return (high << 32n) | low;
}
