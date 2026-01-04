import path from "node:path";
import { Package, PackageInfo } from "./abstract-package.ts";
import { Chain, EFFECTSTREAM_VERSION } from "../options.ts";
import {
  scaffoldMidnightProject,
  scaffoldMidnightContract,
} from "@effectstream/midnight-contracts/scaffold";
import { midnightContractOptions } from "@effectstream/midnight-contracts/scaffold";
import {
  midnightPrimitiveBlock as midnightPrimitiveBlock_,
  getReadContractCode as getReadContractCode_,
  contractBatcher as contractBatcher_,
  midnightGrammar as midnightGrammar_,
  midnightStateMachine as midnightStateMachine_,
} from "@effectstream/midnight-contracts/scaffold";

export class ChainMidnightPackage extends Package {
  constructor(
    projectPath: string,
    options: Package["options"],
    private chain: Chain
  ) {
    super(projectPath, options);
  }

  static midnightReadContractCode = (contractName: string, index: number) => {
    return `const { contractInfo: contractInfo${index}, contractAddress: contractAddress${index}, zkConfigPath: zkConfigPath${index} } = readMidnightContract("${contractName}", "contract-${contractName}.json");`
  }

  static midnightImportBlock = (projectName: string, contractName: string, extension: string = "/contract", importPostfix: string = "Contract") => {
    const safeCodeContractName =
      ChainMidnightPackage.safeCodeContractName(contractName);
    const safePackageName = ChainMidnightPackage.safePackageName(contractName);
    return `
          import * as ${safeCodeContractName}${importPostfix} from "@${projectName}/midnight-contract-${safePackageName}${extension || ''}";
        `;
  };

  static midnightPrimitiveBlock = (contractName: string) => {
    const safeCodeContractName =
      ChainMidnightPackage.safeCodeContractName(contractName);
    const safePackageName = ChainMidnightPackage.safePackageName(contractName);
    return midnightPrimitiveBlock_(safeCodeContractName, safePackageName);
  };

  static contractBatcher = (contractName: string, index: number) => {
    const safeCodeContractName =
      ChainMidnightPackage.safeCodeContractName(contractName);
    const safePackageName = ChainMidnightPackage.safePackageName(contractName);
    return contractBatcher_(safeCodeContractName, safePackageName, index);
  };

  static getReadContractCode = (contractName: string) => {
    const safePackageName = ChainMidnightPackage.safePackageName(contractName);
    return getReadContractCode_(safePackageName);
  };

  static safeCodeContractName(contractName: string): string {
    return contractName.replace(/[^a-zA-Z0-9_]/g, "_");
  }

  static safePackageName(contractName: string): string {
    return contractName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
  }

  static midnightGrammar(contractName: string): {
    customGrammar: string;
    builtInGrammar: string;
  } {
    const safePackageName = ChainMidnightPackage.safePackageName(contractName);
    return midnightGrammar_(safePackageName);
  }

  static midnightStateMachine(contractName: string): string {
    const safePackageName = ChainMidnightPackage.safePackageName(contractName);
    return midnightStateMachine_(safePackageName);
  }

  public async generate(): Promise<PackageInfo> {
    const chainPath = path.join(
      this.projectPath,
      "packages",
      "shared",
      "contracts",
      this.chain + "-contracts"
    );

    const packageInfo = await scaffoldMidnightProject(
      chainPath,
      this.options.projectName,
      EFFECTSTREAM_VERSION,
      this.options.contracts.midnight?.map((contract) => ({
        safeCodeName: ChainMidnightPackage.safeCodeContractName(contract),
        safePackageName: ChainMidnightPackage.safePackageName(contract),
      })) || []
    );

    const subPackages: PackageInfo[] = [];
    for (const contract of this.options.contracts.midnight || []) {
      const safeCodeContractName =
        ChainMidnightPackage.safeCodeContractName(contract);
      const safePackageName = ChainMidnightPackage.safePackageName(contract);
      const contractPath = path.join(
        this.projectPath,
        "packages",
        "shared",
        "contracts",
        "midnight-contracts",
        safePackageName
      );

      const contractFile = midnightContractOptions.find(
        (o) => o.value === contract
      )!.file;

      const contractInfo = await scaffoldMidnightContract(
        contractPath,
        this.options.projectName,
        safeCodeContractName,
        safePackageName,
        contractFile,
        EFFECTSTREAM_VERSION
      );
      subPackages.push(contractInfo);
    }

    return { name: packageInfo.name, path: packageInfo.path, subPackages };
  }
}
