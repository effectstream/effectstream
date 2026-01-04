import path from "node:path";
import { Package, PackageInfo } from "./abstract-package.ts";
import { DenoJsonFile } from "../file-types/deno-json-file.ts";
import { Chain, EFFECTSTREAM_VERSION } from "../options.ts";
import { scaffoldCardanoProject } from "@effectstream/cardano-contracts/scaffold";
import {
  cardanoPrimitiveBlock as cardanoPrimitiveBlock_,
  cardanoGrammar as cardanoGrammar_,
  cardanoStateMachine as cardanoStateMachine_,
} from "@effectstream/cardano-contracts/scaffold";

export class ChainCardanoPackage extends Package {
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

    return await scaffoldCardanoProject(
      chainPath,
      this.options.projectName,
      EFFECTSTREAM_VERSION
    );
  }

  public static cardanoPrimitiveBlock(contract: string): string {
    return cardanoPrimitiveBlock_(contract);
  }

  public static cardanoGrammar(contract: string): {
    customGrammar: string;
    builtInGrammar: string;
  } {
    return cardanoGrammar_(contract);
  }

  public static cardanoStateMachine(contract: string): string {
    return cardanoStateMachine_(contract);
  }
}
