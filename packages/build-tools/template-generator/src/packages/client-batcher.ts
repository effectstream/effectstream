import { Package, PackageInfo } from "./abstract-package.ts";
import { DenoJsonFile, TypescriptFile } from "../file-types/index.ts";
import { PAIMA_VERSION } from "../options.ts";
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

    const midnightImportBlockCode = this.options.chains.includes("midnight") ? 
    this.options.contracts.midnight?.map(contract => ChainMidnightPackage.midnightImportBlock(this.options.projectName, contract)).join("\n") : ""
  
    // TODO This is not working.
    const currentDir = path.dirname(path.fromFileUrl(import.meta.url));
    await copyFiles(
      path.join(currentDir, "templates", "batcher", "src"),
      path.join(batcherPath, "src"),
      {"scope": this.options.projectName}, // replacements
      {}, // no code blocks
      {"MIDNIGHT-IMPORT-BLOCK": midnightImportBlockCode}
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
        "@paimaexample/batcher": "jsr:@paimaexample/batcher@" + PAIMA_VERSION,
        "@paimaexample/utils": "jsr:@paimaexample/utils@" + PAIMA_VERSION,
        "@paimaexample/concise": "jsr:@paimaexample/concise@" + PAIMA_VERSION,
        "@paimaexample/coroutine":
          "jsr:@paimaexample/coroutine@" + PAIMA_VERSION,
        effection: "npm:effection@^3.5.0",
        "@std/path": "jsr:@std/path@^1.1.2",
        viem: "npm:viem@2.37.3",
      },
      tasks: {
        start: "deno run -A --unstable-detect-cjs src/main.ts",
      },
    };
    await new DenoJsonFile(path.join(batcherPath, "deno.json"), deno).write();

    return { name: packageName, path: batcherPath };
  }
}
