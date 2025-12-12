import path from "node:path";
import { Package, PackageInfo } from "./abstract-package.ts";
import { Chain, EFFECTSTREAM_VERSION } from "../options.ts";
import { scaffoldEVMProject } from "@effectstream/evm-hardhat/scaffold";
import {
  evmContractOptions,
  evmPrimitiveBlock as evmPrimitiveBlock_,
  evmGrammar as evmGrammar_,
  evmStateMachine as evmStateMachine_,
} from "@effectstream/evm-hardhat/scaffold";

export class ChainEVMPackage extends Package {
  constructor(
    projectPath: string,
    options: Package["options"],
    public chain: Chain
  ) {
    super(projectPath, options);
  }

  public static safeCodeContractName(contract: string): string {
    return contract.replace(/-/g, "_");
  }

  public static safePackageName(contract: string): string {
    return contract.replace(/-/g, "_");
  }

  public async generate(): Promise<PackageInfo> {
    const chainPath = path.join(
      this.projectPath,
      "packages",
      "shared",
      "contracts",
      this.chain + "-contracts"
    );
    const contracts =
      this.options.contracts.evm?.map((contract) => ({
        safeCodeName: ChainEVMPackage.safeCodeContractName(contract),
        safePackageName: ChainEVMPackage.safePackageName(contract),
      })) || [];

    return await scaffoldEVMProject(
      chainPath,
      this.options.projectName,
      EFFECTSTREAM_VERSION,
      contracts
    );
  }

  public static evmGrammar(contract: string): {
    customGrammar: string;
    builtInGrammar: string;
  } {
    return evmGrammar_(contract);
  }

  public static evmStateMachine(contract: string): string {
    return evmStateMachine_(contract);
  }

  public static evmPrimitiveBlock(
    contract: string,
    contractPackageName: string
  ): string {
    return evmPrimitiveBlock_(contract, contractPackageName);
  }
}
