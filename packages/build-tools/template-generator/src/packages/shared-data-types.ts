import * as path from "jsr:@std/path";
import { Package, PackageInfo } from "./abstract-package.ts";
import { DenoJsonFile } from "../file-types/index.ts";
import { copyFiles } from "../file-operations.ts";
import { PAIMA_VERSION } from "../options.ts";

export class SharedDataTypesPackage extends Package {
  public async generate(): Promise<PackageInfo> {
    const dataTypesPath = path.join(
      this.projectPath,
      "packages",
      "shared",
      "data-types"
    );
    const packageName = `@${this.options.projectName}/data-types`;

    const currentDir = path.dirname(path.fromFileUrl(import.meta.url));
    const folders = [["src"]];
    for (const folder of folders) {
      await copyFiles(
        path.join(currentDir, "templates", "data-types", ...folder),
        path.join(dataTypesPath, ...folder),
        { "\\[scope\\]": this.options.projectName }, // replacements
        {
          "EVM-BLOCK": this.options.chains.includes("evm"),
          "MIDNIGHT-BLOCK": this.options.chains.includes("midnight"),
        } // code blocks
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
        "@paimaexample/concise": "jsr:@paimaexample/concise@" + PAIMA_VERSION,
        "@paimaexample/config": "jsr:@paimaexample/config@" + PAIMA_VERSION,
        "@paimaexample/utils": "jsr:@paimaexample/utils@" + PAIMA_VERSION,
        "@paimaexample/db": "jsr:@paimaexample/db@" + PAIMA_VERSION,
        "@paimaexample/sm": "jsr:@paimaexample/sm@" + PAIMA_VERSION,
        viem: "npm:viem@2.37.3",
        "@sinclair/typebox": "npm:@sinclair/typebox@^0.34.30",
      },
    };
    await new DenoJsonFile(path.join(dataTypesPath, "deno.json"), deno).write();

    return { name: packageName, path: dataTypesPath };
  }
}
