import * as path from "jsr:@std/path";
import { Package, PackageInfo } from "./abstract-package.ts";
import { DenoJsonFile } from "../file-types/index.ts";
import { copyFiles } from "../file-operations.ts";
import { EFFECTSTREAM_VERSION } from "../options.ts";
import { ChainMidnightPackage } from "./chain-midnight.ts";
import { ChainEVMPackage } from "./chain-evm.ts";
import { ChainAvailPackage } from "./chain-avail.ts";
import { ChainCardanoPackage } from "./chain-cardano.ts";

export class SharedDataTypesPackage extends Package {
  public async generate(): Promise<PackageInfo> {
    const dataTypesPath = path.join(
      this.projectPath,
      "packages",
      "shared",
      "data-types"
    );
    const packageName = `@${this.options.projectName}/data-types`;



    const midnightImportBlockCode = this.options.chains.includes("midnight") ? 
      this.options.contracts.midnight?.map(contract => ChainMidnightPackage.midnightImportBlock(this.options.projectName, contract)).join("\n") : ""
    
      const midnightPrimitiveBlockCode = this.options.chains.includes("midnight") ? 
      this.options.contracts.midnight?.map(contract => ChainMidnightPackage.midnightPrimitiveBlock(contract)).join("\n") : ""

    
    const currentDir = path.dirname(path.fromFileUrl(import.meta.url));
    const folders = [["src"]];
    for (const folder of folders) {
      await copyFiles(
        path.join(currentDir, "templates", "data-types", ...folder),
        path.join(dataTypesPath, ...folder),
        { "scope": this.options.projectName }, // replacements
        {
          "EVM-BLOCK": this.options.chains.includes("evm"),
          "MIDNIGHT-BLOCK": this.options.chains.includes("midnight"),
          "AVAIL-BLOCK": this.options.chains.includes("avail"),
          "CARDANO-BLOCK": this.options.chains.includes("cardano"),
        },
        {
          "EVM-IMPORT-BLOCK": "",
          "EVM-PRIMITIVE-BLOCK": this.options.contracts.evm?.map(contract => ChainEVMPackage.evmPrimitiveBlock(ChainEVMPackage.safePackageName(contract))).join("\n") || "",
          "MIDNIGHT-IMPORT-BLOCK": midnightImportBlockCode || "",
          "MIDNIGHT-PRIMITIVE-BLOCK": midnightPrimitiveBlockCode || "",
          "AVAIL-IMPORT-BLOCK": "",
          "AVAIL-PRIMITIVE-BLOCK": this.options.contracts.avail?.map(contract => ChainAvailPackage.availPrimitiveBlock(contract)).join("\n") || "",
          "CARDANO-IMPORT-BLOCK": "",
          "CARDANO-PRIMITIVE-BLOCK": this.options.contracts.cardano?.map(contract => ChainCardanoPackage.cardanoPrimitiveBlock(contract)).join("\n") || "",
        }
      );
    }

    const deno = {
      name: packageName,
      version: "0.3.0",
      license: "MIT",
      exports: {
        "./localhostConfig": "./src/localhostConfig.ts",
        "./grammar": "./src/grammar.ts",
      },
      imports: {
        "@paimaexample/concise": "jsr:@paimaexample/concise@" + EFFECTSTREAM_VERSION,
        "@paimaexample/config": "jsr:@paimaexample/config@" + EFFECTSTREAM_VERSION,
        "@paimaexample/utils": "jsr:@paimaexample/utils@" + EFFECTSTREAM_VERSION,
        "@paimaexample/db": "jsr:@paimaexample/db@" + EFFECTSTREAM_VERSION,
        "@paimaexample/sm": "jsr:@paimaexample/sm@" + EFFECTSTREAM_VERSION,
        viem: "npm:viem@2.37.3",
        "@sinclair/typebox": "npm:@sinclair/typebox@^0.34.30",
      },
    };
    await new DenoJsonFile(path.join(dataTypesPath, "deno.json"), deno).write();

    return { name: packageName, path: dataTypesPath };
  }
}
