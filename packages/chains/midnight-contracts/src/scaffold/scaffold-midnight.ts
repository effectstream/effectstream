import * as path from "@std/path";
import { copyFiles } from "./scaffold-helpers.ts";
import { currentDir } from "./scaffold-helpers.ts";

/* 
 * This module is responsible for scaffolding a new project.
 */
export async function scaffoldMidnightProject(
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
    const fullPackageName = `@${packageName}/midnight-contracts`;

    const folders = [
        [""], 
        ["indexer-standalone"],
    ];

    for (const folder of folders) {
        await Deno.mkdir(path.join(targetFolder, ...folder), { recursive: true });
    }

    for (const folder of folders) {
        await copyFiles(
            path.join(currentDir(), "template", ...folder), 
            path.join(targetFolder, ...folder), {
                replacements: {
                    "scope": packageName,
                    "EFFECTSTREAM-VERSION": version
                },
                codeInsertions: {
                    "MIDNIGHT-DEPLOY-IMPORTS": contracts
                        .map(({ safeCodeName, safePackageName }) => importDeployContract(safeCodeName, safePackageName))
                        .join("\n"),
                    "MIDNIGHT-DEPLOY-CONFIG": contracts
                        .map(({ safeCodeName, safePackageName }) => deployContract(safeCodeName, safePackageName))
                        .join(",\n"),
                }, 
            }
        );
    }

    return {
        name: fullPackageName,
        path: targetFolder
    }
};

export function midnightPrimitiveBlock(safeCodeContractName: string, safePackageName: string): string {
    return `
        .addPrimitive(
          (syncProtocols) => syncProtocols.parallelMidnight,
          (network, deployments, syncProtocol) => ({
            name: "primitive_${safePackageName}",
            type: builtin.PrimitiveTypeMidnightGeneric,
            startBlockHeight: 1,
            contractAddress: readMidnightContract("${safePackageName}", "contract-${safePackageName}.json").contractAddress,
            stateMachinePrefix: "event_midnight_${safePackageName}",
            contract: { ledger: ${safeCodeContractName}Contract.ledger },
            networkId: 0,
          })
        )
      `;
}

export function midnightGrammar(safePackageName: string): {
    customGrammar: string;
    builtInGrammar: string;
} {
    return {
        builtInGrammar: `"event_midnight_${safePackageName}": builtinGrammars.midnightGeneric,`,
        customGrammar: '',
    }
}

export function midnightStateMachine(safePackageName: string): string {
    return `
        stm.addStateTransition("event_midnight_${safePackageName}", function* (data) {
            console.log(
                "🎉 [MIDNIGHT:${safePackageName}] Transaction receipt:",
                JSON.stringify(data.parsedInput.payload)
            );
            // Insert into database
            // yield* World.resolve(insert, { params });
        });
`;
}

const importDeployContract = (contractCodeName: string, contractPackageName: string) => {
    return `
        import {
            ${contractCodeName},
            witnesses as ${contractCodeName}Witnesses,
        } from "./${contractPackageName}/src/index.original.ts";
    `
}
const deployContract = (
    contractCodeName: string,
    contractPackageName: string,
) => {
    return `
       {
        contractName: "${contractPackageName}",
        contractFileName: "contract-${contractPackageName}.json",
        contractClass: ${contractCodeName}.Contract,
        witnesses: ${contractCodeName}Witnesses,
        privateStateId: "${contractCodeName}State",
        initialPrivateState: {},
        deployArgs: [],
        privateStateStoreName: "${contractPackageName}-private-state",
        extractWalletAddress: true, // Extract wallet address and replace last arg with initialOwner
    }
`;
}

if (import.meta.main) {
    function checkInputs(args: string[]): { targetFolder: string, packageName: string, version: string } {
        const targetFolder = args[0];
        const packageName = args[1];
        const version = args[2];
        if (!targetFolder) {
            console.error("Target folder is required");
            Deno.exit(1);
        }
        if (!packageName) {
            console.error("Package name is required");
            Deno.exit(1);
        }
        if (!version) {
            console.error("Version is required");
            Deno.exit(1);
        }
        return { 
            targetFolder: targetFolder.trim(), 
            packageName: packageName.trim(),
            version: version.trim()
        };
    }
 
    checkInputs(Deno.args);
    const { targetFolder, packageName, version } = checkInputs(Deno.args);
    await scaffoldMidnightProject(targetFolder, packageName, version, []);
}
