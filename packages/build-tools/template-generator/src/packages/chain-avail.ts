import path from "node:path";
import { Package, PackageInfo } from "./abstract-package.ts";
import { Chain, EFFECTSTREAM_VERSION } from "../options.ts";
import { scaffoldAvailProject } from "@effectstream/avail-contracts/scaffold";
import {
  availPrimitiveBlock as availPrimitiveBlock_,
  availGrammar as availGrammar_,
  availStateMachine as availStateMachine_,
} from "@effectstream/avail-contracts/scaffold";

export class ChainAvailPackage extends Package {
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
    // const contracts = this.options.contracts.evm?.map(contract => ({
    //     safeCodeName: ChainEVMPackage.safeCodeContractName(contract),
    //     safePackageName: ChainEVMPackage.safePackageName(contract),
    // })) || [];

    return await scaffoldAvailProject(
      chainPath,
      this.options.projectName,
      EFFECTSTREAM_VERSION
    );
  }

  public static availPrimitiveBlock(contract: string): string {
    return availPrimitiveBlock_(contract);
  }

  public static availGrammar(contract: string): {
    customGrammar: string;
    builtInGrammar: string;
  } {
    return availGrammar_(contract);
  }

  public static availStateMachine(contract: string): string {
    return availStateMachine_(contract);
  }
}
