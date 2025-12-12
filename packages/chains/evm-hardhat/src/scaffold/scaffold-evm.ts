import * as path from "@std/path";
import { evmContractOptions } from "./scaffold-options.ts";
import { copyFiles } from "./scaffold-helpers.ts";
import { currentDir } from "./scaffold-helpers.ts";

/* 
 * This module is responsible for scaffolding a new project.
 * 
Expected structure.
 evm-root
   |- ignition
   |   |- modules
   |        |- contract1.ts
   |        |- contract2.ts
   |        |- ...
   |- src/contracts
   |   |- contract1.sol
   |   |- contract2.sol
   |   |- ...
   |- deploy.ts
   |- hardhat.config.ts
   |- package.json
   |- foundry.toml
   |- deno.json
   |- .gitignore
   |- README.md
 *
 */

export async function scaffoldEVMProject(
    targetFolder: string, 
    packageName: string, 
    version: string,
    contracts: {
        safeCodeName: string,
        safePackageName: string,
    }[]
): Promise<{
    name: string;
    path: string;
}> {
    const fullPackageName = `@${packageName}/evm-contracts`;

    const folders = [
        [""], 
    ];

    const evmModules: string[] = [];
    const evmModulesImports: string[] = [];
    for (const contract of contracts) {
        evmModules.push(
            `{
                module: ${contract.safePackageName}Module,
                network: "evmMainHttp",
            }`
        );
        // import ExampleContractModule from "./ignition/modules/example-contract-module.ts";
        evmModulesImports.push(
            `import ${contract.safeCodeName}Module from "./ignition/modules/${contract.safePackageName}-module.ts";`
        );
    }


    for (const folder of folders) {
        await Deno.mkdir(path.join(targetFolder, ...folder), { recursive: true });
    }

    for (const folder of folders) {
        await copyFiles(
            path.join(currentDir(), "template", ...folder), 
            path.join(targetFolder, ...folder), 
            {
                replacements: {
                    "scope": packageName,
                    "EFFECTSTREAM-VERSION": version
                },
                codeInsertions: {
                    "EVM-MODULES": evmModules.join(",\n"),
                    "EVM-MODULES-IMPORT": evmModulesImports.join("\n"),
                }
            }
        );
    }

    for (const contract of contracts) {
        await scaffoldEVMContract(
            targetFolder,
            contract.safeCodeName,
            contract.safePackageName
        );
    }

    return {
        name: fullPackageName,
        path: targetFolder
    }
};



async function scaffoldEVMContract(
    targetFolder: string,
    contractCodeName: string,
    contractPackageName: string
): Promise<void> {
    const folders = [
        ["ignition", "modules"], 
        ["src", "contracts"]
    ];

    for (const folder of folders) {
        await Deno.mkdir(path.join(targetFolder, ...folder), { recursive: true });
    }

    for (const folder of folders) {

        const option = evmContractOptions.find(o => o.value === contractPackageName);
        if (!option) {
            console.error(`Contract option ${contractPackageName} not found`);
            Deno.exit(1);
        }

        await copyFiles(
            path.join(currentDir(), "template", ...folder), 
            path.join(targetFolder, ...folder), 
            {
                replacements: {
                    "contractPackageName": contractPackageName,
                    "contractCodeName": contractCodeName,
                },
                replaceFileNames: {
                    "example-module.ts": `${contractCodeName}-module.ts`, 
                    "example-contract.sol": `${contractCodeName}.sol`
                }
            }
        );

        // overwrite the contract file with the actual contract code
        const contractCode = await Deno.readTextFile(option.file);
        await Deno.writeTextFile(
            path.join(targetFolder, "src", "contracts", `${contractCodeName}.sol`),
            contractCode
        );
    }
}
