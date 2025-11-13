import * as path from "jsr:@std/path";

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

// Copy files
export async function copyFiles(
    sourceDir: string, 
    targetDir: string,
    config: { 
        replacements?: Record<string, string>,
        codeBlocks?: Record<string, boolean>,
        codeInsertions?: Record<string, string>,
        replaceFileNames?: Record<string, string>,
    } = {},
): Promise<void> {
    const files = await Deno.readDir(sourceDir);
    await Deno.mkdir(targetDir, { recursive: true });

    for await (const file of files) {
        if (file.isDirectory) {
            continue;
        }
        let finalName = file.name.replace(/.rename$/, "");
        if (config.replaceFileNames?.[finalName]) {
            finalName = config.replaceFileNames[finalName];
        }

        let content = await Deno.readTextFile(path.join(sourceDir, file.name));
        
        // Enable/disable entire inlined code blocks
        for (const [codeBlock, enabled] of Object.entries(config.codeBlocks || {})) {
            // Search for block of code between /** TAG */ ... /** TAG */
            const r = `\\/\\*\\* ${codeBlock} \\*\\/([\\s\\S]+)\\/\\*\\* ${codeBlock} \\*\\/`;
            const regex = new RegExp(r, 'g');
            if (enabled) {
                content = content.replace(regex, `$1`);
            } else {
                content = content.replace(regex, '');
            }
        }

        // Insert dynamically generated code blocks
        for (const [r, code] of Object.entries(config.codeInsertions || {})) {
            // Search for tags /** TAG */
            const regex = new RegExp(`\\/\\*\\* ${r} \\*\\/`, 'g');
            content = content.replace(regex, code);
        }
        
        // Replace placeholders with actual values
        for (const [r, replacement] of Object.entries(config.replacements || {})) { 
            // Replace tags in [TAG] format
            const regex = new RegExp(`\\[${r}\\]`, 'g');
            content = content.replace(regex, replacement);
        }
        
        await Deno.writeTextFile(path.join(targetDir, finalName), content);
    }
}

// Get current directory - this has to be JSR compatible.
function currentDir(): string {
    return path.dirname(path.fromFileUrl(import.meta.url));
}

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
    }
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
    await scaffoldEVMProject(targetFolder, packageName, version);
}