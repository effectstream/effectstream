import * as path from "jsr:@std/path";
import { copyFiles } from "./scaffold-helpers.ts";
import { currentDir } from "./scaffold-helpers.ts";

/**
 * This module is responsible for scaffolding a new midnight contract.
 * 
 * @param targetFolder - root where project will be scaffolded.
 * @param packageName - name of the parent package.
 * @param contractCodeName - someSafe_nameForJSCode
 * @param contractPackageName - some-safe-name-for-package
 * @param version - version of the effectstream packages
 * @returns - name and path of the scaffolded contract package
 */
export async function scaffoldMidnightContract(
    targetFolder: string, 
    packageName: string, 
    contractCodeName: string,
    contractPackageName: string,
    contractFile: string,
    version: string
): Promise<{
    name: string;
    path: string;
}> {
    const fullPackageName = `@${packageName}/midnight-contract-${contractPackageName}`;

    const folders = [
        [""], 
        ["src"],
        ["src", "base-contracts", "src", "access"],
        ["src", "base-contracts", "src", "security"],
        ["src", "base-contracts", "src", "token"],
        ["src", "base-contracts", "src", "utils"],
    ];

    for (const folder of folders) {
        await Deno.mkdir(path.join(targetFolder, ...folder), { recursive: true });
    }

    for (const folder of folders) {
        await copyFiles(
            path.join(currentDir(), "template", "contract-template", ...folder), 
            path.join(targetFolder, ...folder), {
            replacements: {
                "scope": packageName,
                "contract-name": contractPackageName,
                "EFFECTSTREAM-VERSION": version,
                "contract-code-name": contractCodeName,
            },
            replaceFileNames: {
                "contract-name.compact": `${contractPackageName}.compact`,
            }
        });
    }

    await Deno.copyFile(
        path.join(contractFile),
        path.join(targetFolder, "src", `${contractPackageName}.compact`),
    );

    return {
        name: fullPackageName,
        path: targetFolder
    }
};


if (import.meta.main) {
    function checkInputs(args: string[]): { 
        targetFolder: string, 
        packageName: string, 
        contractCodeName: string,
        contractPackageName: string,
        version: string 
    } {
        const targetFolder = args[0];
        const packageName = args[1];
        const contractCodeName = args[2];
        const contractPackageName = args[3];
        const version = args[4];
        if (!targetFolder) {
            console.error("Target folder is required");
            Deno.exit(1);
        }
        if (!version) {
            console.error("Version is required");
            Deno.exit(1);
        }
        if (!contractCodeName) {
            console.error("Contract code name is required");
            Deno.exit(1);
        }
        if (!contractPackageName) {
            console.error("Contract package name is required");
            Deno.exit(1);
        }
        if (!packageName) {
            console.error("Package name is required");
            Deno.exit(1);
        }
        if (!contractFileName) {
            console.error("Contract file name is required");
            Deno.exit(1);
        }   
        return { 
            targetFolder: targetFolder.trim(), 
            packageName: packageName.trim(),
            contractCodeName: contractCodeName.trim(),
            contractPackageName: contractPackageName.trim(),
            contractFileName: contractFileName.trim(),
            version: version.trim()
        };
    }
    const { targetFolder, packageName, contractCodeName, contractPackageName, contractFileName, version } = checkInputs(Deno.args);
    await scaffoldMidnightContract(
        targetFolder, 
        packageName, 
        contractCodeName, 
        contractPackageName,
        contractFileName,
        version
    );
}
