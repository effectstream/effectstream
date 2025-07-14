import {
  InternalRpcError,
  InvalidParamsRpcError,
  MethodNotFoundRpcError,
  MethodNotSupportedRpcError,
  type PublicRpcSchema,
  RpcRequestError,
} from "npm:viem";
import { ENV } from "@paima/utils";

export type PaimaEvmRpcSchema = [
  ...PublicRpcSchema,
  {
    Method: "eth_syncing";
    Parameters?: undefined;
    /**
     * different EVM clients return different values for this
     * but the two seemingly common fields are
     * - startingBlock
     * - currentBlock
     */
    ReturnType: boolean | {
      startingBlock: `0x${string}`;
      currentBlock: `0x${string}`;
    };
  },
];

export type EvmRpcReturn<Method extends string> = Extract<
  PaimaEvmRpcSchema[number],
  { Method: Method }
>["ReturnType"];

export function createRpcRequestError(
  data: Record<string, unknown>,
  code: number,
  msg?: string,
): RpcRequestError {
  return new RpcRequestError({
    body: data,
    url: `http://localhost:${ENV.PAIMA_API_PORT}/rpc/evm`,
    error: {
      code: code,
      message: msg ?? "No additional information provided",
    },
  });
}

export function createInternalRpcError(
  data: Record<string, unknown>,
  msg?: string,
): InternalRpcError {
  return new InternalRpcError(
    createRpcRequestError(data, InternalRpcError.code, msg),
  );
}

export function createMethodNotSupportedRpcError(
  method: string,
  msg?: string,
): MethodNotFoundRpcError {
  return new MethodNotFoundRpcError(
    createRpcRequestError({}, MethodNotFoundRpcError.code, msg),
    {
      method,
    },
  );
}

export function createMethodNotFoundRpcError(
  method: string,
  msg?: string,
): MethodNotSupportedRpcError {
  return new MethodNotSupportedRpcError(
    createRpcRequestError({}, MethodNotSupportedRpcError.code, msg),
    { method },
  );
}

export function createInvalidParamsError(
  data: Record<string, unknown>,
  msg?: string,
): InvalidParamsRpcError {
  return new InvalidParamsRpcError(
    createRpcRequestError(data, InvalidParamsRpcError.code, msg),
  );
}
