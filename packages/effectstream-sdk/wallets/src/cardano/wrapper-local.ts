import type { Result } from "@effectstream/utils";
import type { IProvider } from "../IProvider.ts";
import type { WalletMode, ApiForMode } from "../utils.ts";
import type { LoginInfoMap } from "../wallet-modes.ts";
import { CardanoLocalConnector } from "./local.ts";
import { formatError } from "../helpers/format-error.ts";

export async function cardanoLocalLoginWrapper(
  loginInfo: LoginInfoMap[WalletMode.CardanoLocal],
): Promise<Result<IProvider<ApiForMode<WalletMode.CardanoLocal>>>> {
  try {
    console.log("cardanoLocalLoginWrapper: building Lucid wallet from seed");
    const provider = await CardanoLocalConnector.instance().connectFromSeed({
      seedPhrase: loginInfo.seedPhrase,
      network: loginInfo.network,
      provider: loginInfo.provider,
    });
    return {
      success: true,
      result: provider as unknown as IProvider<
        ApiForMode<WalletMode.CardanoLocal>
      >,
    };
  } catch (err) {
    console.log("cardanoLocalLoginWrapper: error while building local Cardano wallet");
    return {
      success: false,
      errorMessage: formatError(err),
    };
  }
}
