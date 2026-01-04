import path from "node:path";
import { Package, PackageInfo } from "./abstract-package.ts";
import { DenoJsonFile } from "../file-types/deno-json-file.ts";
import { Chain, EFFECTSTREAM_VERSION } from "../options.ts";
import {
  scaffoldBitcoinProject,
  bitcoinPrimitiveBlock as bitcoinPrimitiveBlock_,
  bitcoinGrammar as bitcoinGrammar_,
  bitcoinStateMachine as bitcoinStateMachine_,
} from "@effectstream/bitcoin-contracts/scaffold";

export class ChainBitcoinPackage extends Package {
  constructor(
    projectPath: string,
    options: Package["options"],
    private chain: Chain
  ) {
    super(projectPath, options);
  }

  public async generate(): Promise<PackageInfo> {
    const chainPath = path.join(
      this.projectPath,
      "packages",
      "shared",
      "contracts",
      this.chain + "-contracts"
    );

    return await scaffoldBitcoinProject(
      chainPath,
      this.options.projectName,
      EFFECTSTREAM_VERSION
    );
  }

  public static bitcoinImportBlock(
    projectName: string,
    contractName: string
  ): string {
    return ``;
  }

  public static bitcoinGrammar(contract: string): {
    customGrammar: string;
    builtInGrammar: string;
  } {
    return bitcoinGrammar_(contract);
  }

  public static bitcoinStateMachine(contract: string): string {
    return bitcoinStateMachine_(contract);
  }

  public static bitcoinPrimitiveBlock(_: string): string {
    return bitcoinPrimitiveBlock_();
  }
}
