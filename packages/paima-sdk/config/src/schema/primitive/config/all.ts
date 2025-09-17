import { Type } from "@sinclair/typebox";
import {
  PrimitiveEvmPaimaL2Config,
} from "./evm/rpc.ts";

import type { ToKeyedUnion } from "../../mod.ts";

const ConfigPrimitives = <Bool extends boolean>(
  requireOptional: Bool,
) =>
  [
    PrimitiveEvmPaimaL2Config.allProperties(requireOptional),
  ] as const;

export const ConfigPrimitiveAll = <Bool extends boolean>(
  requireOptional: Bool,
) => Type.Union([...ConfigPrimitives<Bool>(requireOptional)]);

export type KeyedConfigPrimitiveAll = ToKeyedUnion<
  ReturnType<typeof ConfigPrimitives<true>>
>;
