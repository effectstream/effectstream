import type { Result } from "@effectstream/utils";
import type { IProvider } from "../IProvider.ts";
import type { WalletMode, ApiForMode } from "../utils.ts";
import type { LoginInfoMap } from "../wallet-modes.ts";
import { type ViemApi, ViemConnector } from "./viem.ts";
import { formatError } from "../helpers/format-error.ts";

export async function viemLoginWrapper(
  loginInfo: LoginInfoMap[WalletMode.EvmViem],
): Promise<Result<IProvider<ApiForMode<WalletMode.EvmViem>>>> {
  try {
    console.log("viemLoginWrapper: building viem WalletClient from private key");
    const provider = await ViemConnector.instance().connectFromPrivateKey({
      privateKey: loginInfo.privateKey,
      rpcUrl: loginInfo.rpcUrl,
      chain: loginInfo.chain,
    });
    return {
      success: true,
      result: provider as unknown as IProvider<ApiForMode<WalletMode.EvmViem>>,
    };
  } catch (err) {
    console.log("viemLoginWrapper: error while building local viem wallet");
    return {
      success: false,
      errorMessage: formatError(err),
    };
  }
}

export type { ViemApi };
