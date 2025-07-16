import { types } from "hardhat/config";
import { listDeployments } from "@nomicfoundation/ignition-core";
import * as path from "path";
import * as fs from "fs";
import { paimaScope } from "./common.js";
import * as ts from "typescript";
import * as dom from "dts-dom";

paimaScope
  .task(
    "copy-ignition-deployment",
    `Copy the hardhat-ignition deployed addresses information to a target folder`,
  )
  .addParam(
    "rootDir",
    `Root directory of your hardhat-ignition project`,
    undefined,
    types.string,
  )
  .addParam(
    "outDir",
    `Build output directory to place deployment info`,
    undefined,
    types.string,
  )
  .setAction(async (taskArgs, hre) => {
    await copyDeployments(taskArgs.rootDir, taskArgs.outDir);
  });
export async function copyDeployments(
  rootDir: string,
  outDir: string,
): Promise<void> {
  const deploymentDir = path.resolve(rootDir, "src", "ignition", "deployments");
  const deployments = await listDeployments(deploymentDir);

  const allDeployments: Record<string, Record<string, string>> = {};
  for (const deployment of deployments) {
    const deployedAddressesPath = path.join(
      deploymentDir,
      deployment,
      "deployed_addresses.json",
    );
    allDeployments[deployment] = JSON.parse(
      fs.readFileSync(deployedAddressesPath, "utf8"),
    );
  }
  const outputTs = `export default ${
    JSON.stringify(allDeployments, null, 2)
  } as const;`;

  const deploymentsOutput = path.join(outDir, "deployments");
  if (!fs.existsSync(deploymentsOutput)) {
    fs.mkdirSync(deploymentsOutput, { recursive: true });
  }

  // ESM file
  {
    const result = ts.transpileModule(outputTs, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext, // ESM
        target: ts.ScriptTarget.ESNext,
      },
    });
    fs.writeFileSync(
      path.join(deploymentsOutput, `index.mjs`),
      result.outputText,
      { flag: "w" },
    );
  }
  // CJS file
  {
    const result = ts.transpileModule(outputTs, {
      compilerOptions: {
        module: ts.ModuleKind.NodeNext, // CJS
        target: ts.ScriptTarget.ESNext,
      },
    });
    fs.writeFileSync(
      path.join(deploymentsOutput, `index.cjs`),
      result.outputText,
      { flag: "w" },
    );
  }
  // DTS file
  {
    /**
     * I couldn't find a nice way to convert a TS file to a d.ts file in-memory using the official typescript compiler API
     * since all the standard ways require a bunch of ugly file system operations.
     *
     * I found two ways to get this to work properly:
     * 1. Use `ts-morph` which is a typescript compiler wrapper that does support in-memory operations
     *    The problem is that it can block upgrading typescript since the ts-morph version needs to match your ts version
     * 2. Use `dts-dom` to manually construct the d.ts file as it's fairly simple
     *
     * I went with option 2
     */

    /**
     * This is the unused option (1) in case we ever end up needing it (ex: we need to do imports or other things not easily supported in dts-dom
     */
    // import tsMorph from 'ts-morph';
    //
    // const project = new tsMorph.Project({
    //     useInMemoryFileSystem: true,
    //     compilerOptions: {
    //         module: tsMorph.ModuleKind.ESNext,
    //         target: tsMorph.ScriptTarget.ESNext,
    //         declaration: true,
    //     },
    // });
    // const myClassFile = project.createSourceFile('deployment.ts', outputTs);
    // const emitResult = project.emitToMemory({ emitOnlyDtsFiles: true });
    // const declaration = emitResult.getFiles()[0].text;
    // fs.writeFileSync(path.join(deploymentsOutput, `index.d.ts`), declaration, { flag: 'w' });

    const changeCase = await import("change-case"); // async import since it's an ESM module, and Hardhat only supports CJS
    const file: string[] = [];

    const genType = (name: string, properties: dom.PropertyDeclaration[]) => {
      const type = dom.create.objectType(properties);
      const alias = dom.create.alias(changeCase.pascalCase(name), type);

      return alias;
    };
    const topLevelProperties: dom.PropertyDeclaration[] = [];
    for (const [deploymentName, contracts] of Object.entries(allDeployments)) {
      const type = genType(
        changeCase.pascalCase(deploymentName),
        Object.entries(contracts).map(
          ([contractName, contractAddress]) =>
            dom.create.property(
              contractName,
              dom.type.stringLiteral(contractAddress),
            ),
        ),
      );
      file.push(dom.emit(type));
      topLevelProperties.push(dom.create.property(deploymentName, type));
    }
    const topLevelType = genType(
      "DeployedContracts",
      topLevelProperties,
    );
    file.push(dom.emit(topLevelType));

    const topLevelConst = dom.create.const("_default", topLevelType);
    file.push(dom.emit(topLevelConst));
    const defaultExport = dom.create.exportDefault(topLevelConst.name);
    file.push(dom.emit(defaultExport));
    const dtsContent = file.join("\n");

    fs.writeFileSync(path.join(deploymentsOutput, `index.d.ts`), dtsContent, {
      flag: "w",
    });
  }
}

let name = dom.create.property("name", dom.type.string);
let age = dom.create.property("age", dom.type.number);
let type = dom.create.objectType([name, age]);
let typeBase = dom.create.alias("typeBase", type);
