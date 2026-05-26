import type { Result } from "@effectstream/utils";
import type { IProvider } from "../IProvider.ts";
import type { WalletMode, ApiForMode } from "../utils.ts";
import type { LoginInfoMap } from "../wallet-modes.ts";
import { MidnightLocalConnector } from "./local.ts";

export async function midnightLocalLoginWrapper(
  loginInfo: LoginInfoMap[WalletMode.MidnightLocal],
): Promise<Result<IProvider<ApiForMode<WalletMode.MidnightLocal>>>> {
  try {
    console.log("midnightLocalLoginWrapper: deriving unshielded keystore from seed");
    const provider = await MidnightLocalConnector.instance().connectFromSeed({
      seed: loginInfo.seed,
      networkId: loginInfo.networkId,
    });
    return {
      success: true,
      result: provider as unknown as IProvider<
        ApiForMode<WalletMode.MidnightLocal>
      >,
    };
  } catch (err) {
    console.log("midnightLocalLoginWrapper: error building local Midnight wallet");
    return {
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}
