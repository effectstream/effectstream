import type { Result } from "@effectstream/utils/types";
import type { IProvider } from "../IProvider.ts";
import type { WalletMode, ApiForMode } from "../utils.ts";
import type { LoginInfoMap } from "../wallet-modes.ts";
import {
  MidnightLocalConnector,
  type MidnightLocalNetworkUrls,
} from "./local.ts";
import { formatError } from "../helpers/format-error.ts";

export async function midnightLocalLoginWrapper(
  loginInfo: LoginInfoMap[WalletMode.MidnightLocal],
): Promise<Result<IProvider<ApiForMode<WalletMode.MidnightLocal>>>> {
  try {
    if (loginInfo.networkUrls != null) {
      assertValidNetworkUrls(loginInfo.networkUrls);
    }
    console.log("midnightLocalLoginWrapper: deriving unshielded keystore from seed");
    const provider = await MidnightLocalConnector.instance().connectFromSeed({
      seed: loginInfo.seed,
      networkId: loginInfo.networkId,
      ...(loginInfo.networkUrls == null
        ? {}
        : { networkUrls: loginInfo.networkUrls }),
      ...(loginInfo.syncMode == null ? {} : { syncMode: loginInfo.syncMode }),
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
      errorMessage: formatError(err),
    };
  }
}

function assertValidNetworkUrls(networkUrls: MidnightLocalNetworkUrls): void {
  const protocols: Record<keyof Omit<MidnightLocalNetworkUrls, "id">, string[]> = {
    indexer: ["http:", "https:"],
    indexerWS: ["ws:", "wss:"],
    node: ["http:", "https:", "ws:", "wss:"],
    proofServer: ["http:", "https:"],
  };

  for (const [field, allowedProtocols] of Object.entries(protocols) as Array<
    [keyof typeof protocols, string[]]
  >) {
    const value = networkUrls[field];
    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(`MidnightLocal networkUrls.${field} is required.`);
    }

    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(
        `MidnightLocal networkUrls.${field} must be an absolute URL.`,
      );
    }
    if (!allowedProtocols.includes(parsed.protocol)) {
      throw new Error(
        `MidnightLocal networkUrls.${field} must use ${allowedProtocols.join(" or ")}.`,
      );
    }
  }

  if (networkUrls.id != null && networkUrls.id.trim() === "") {
    throw new Error("MidnightLocal networkUrls.id must not be empty.");
  }
}
