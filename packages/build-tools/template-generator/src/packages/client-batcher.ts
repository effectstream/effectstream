import { Package, PackageInfo } from "./abstract-package.ts";
import { DenoJsonFile } from "../file-types/deno-json-file.ts";
import { TypescriptFile } from "../file-types/typescript-file.ts";
import { EFFECTSTREAM_VERSION } from "../options.ts";
import * as path from "jsr:@std/path";
import { copyFiles } from "../file-operations.ts";
import { ChainMidnightPackage } from "./chain-midnight.ts";

export class ClientBatcherPackage extends Package {
  public async generate(): Promise<PackageInfo | null> {
    if (!this.options.devOptions.useBatcher) {
      return null;
    }

    const batcherPath = path.join(
      this.projectPath,
      "packages",
      "client",
      "batcher"
    );
    const packageName = `@${this.options.projectName}/batcher`;

    const isMidnightEnabled = !!this.options.contracts.midnight;
    const isBitcoinEnabled = !!this.options.contracts.bitcoin;
    const isCardanoEnabled = !!this.options.contracts.cardano;
    const isEvmEnabled = !!this.options.contracts.evm;
    const isAvailEnabled = !!this.options.contracts.avail;
    const isEffectstreaml2Enabled = !!this.options.contracts.evm?.some(contract => contract === "effectstreaml2");

    const midnightImportBlockCodeA = this.options.chains.includes("midnight") ? 
    this.options.contracts.midnight?.map(contract => ChainMidnightPackage.midnightImportBlock(this.options.projectName, contract, "", "Info")).join("\n") : ""
    const midnightImportBlockCodeB = this.options.chains.includes("midnight") ? 
    this.options.contracts.midnight?.map(contract => ChainMidnightPackage.midnightImportBlock(this.options.projectName, contract, "/contract", "Contract")).join("\n") : ""
    const midnightReadContractCodeA = this.options.chains.includes("midnight") ? 
    this.options.contracts.midnight?.map((contract, index): string => {
      return ChainMidnightPackage.midnightReadContractCode(contract, index)
    }).join("\n") : ""

    const midnightReadContractCode = isMidnightEnabled ? 
      this.options.contracts.midnight?.map((contract, index): string => {
        return `const { contractInfo${index}, contractAddress${index}, zkConfigPath${index} } = ${ChainMidnightPackage.getReadContractCode(contract)}`
      }).join("\n") : ""

    const currentDir = path.dirname(path.fromFileUrl(import.meta.url));
    await copyFiles(
      path.join(currentDir, "templates", "batcher", "src"),
      path.join(batcherPath, "src"),
      {
        "scope": this.options.projectName,
      }, // replacements
      {
        "BITCOIN-BLOCK": isBitcoinEnabled,
        "CARDANO-BLOCK": isCardanoEnabled,
        "EVM-BLOCK": isEvmEnabled,
        "AVAIL-BLOCK": isAvailEnabled,
        "EFFECTSTREAM-L2-BLOCK": isEffectstreaml2Enabled,
        "MIDNIGHT-BLOCK": isMidnightEnabled,
      }, // enable code blocks
      {
        "MIDNIGHT-IMPORT-BLOCK": midnightImportBlockCodeA + "\n" + midnightImportBlockCodeB + "\n" + midnightReadContractCodeA,
        "MIDNIGHT-READ-CONTRACT-BLOCK": midnightReadContractCode || "",
        "MIDNIGHT-ADAPTER-BLOCK": this.options.contracts.midnight?.map((contract, index): string => {
          return ChainMidnightPackage.contractBatcher(contract, index)
        }).join("\n") || "",
        "MIDNIGHT-EXPORT-BLOCK": 
          `export const midnightAdapters = { ${this.options.contracts.midnight?.map((contract, index): string => {
            return `"${contract}": midnightAdapter_${ChainMidnightPackage.safeCodeContractName(contract)}`
          }).join(",") || ""} };`,
      }
    );

    const deno = {
      name: packageName,
      exports: {
        ".": "./src/main.ts",
      },
      imports: {
        "@midnight-ntwrk/compact-runtime": isMidnightEnabled
          ? "npm:@midnight-ntwrk/compact-runtime@0.9.0"
          : undefined,
        "@midnight-ntwrk/wallet-sdk-address-format": isMidnightEnabled
          ? "npm:@midnight-ntwrk/wallet-sdk-address-format@2.0.0"
          : undefined,
        "@paimaexample/batcher": "jsr:@paimaexample/batcher@" + EFFECTSTREAM_VERSION,
        "@paimaexample/utils": "jsr:@paimaexample/utils@" + EFFECTSTREAM_VERSION,
        "@paimaexample/concise": "jsr:@paimaexample/concise@" + EFFECTSTREAM_VERSION,
        "@paimaexample/coroutine":
          "jsr:@paimaexample/coroutine@" + EFFECTSTREAM_VERSION,
        effection: "npm:effection@^3.5.0",
        "@std/path": "jsr:@std/path@^1.1.3",
        viem: "npm:viem@2.37.3",
        "bitcoinjs-message": isBitcoinEnabled ? "npm:bitcoinjs-message@^2.2.0" : undefined,
        "bitcoinjs-lib": isBitcoinEnabled ? "npm:bitcoinjs-lib@6.1.5" : undefined,
        "ecpair": isBitcoinEnabled ? "npm:ecpair@2.1.0" : undefined,
        "tiny-secp256k1": isBitcoinEnabled ? "npm:tiny-secp256k1@2.2.3" : undefined,
      },
      tasks: {
        start: "deno run -A --unstable-detect-cjs src/main.ts",
      },
    };
    await new DenoJsonFile(path.join(batcherPath, "deno.json"), deno).write();

    return { name: packageName, path: batcherPath };
  }
}
