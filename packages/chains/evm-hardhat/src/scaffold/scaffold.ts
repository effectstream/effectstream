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
async function copyFiles(sourceDir: string, targetDir: string, replacements: Record<string, string>): Promise<void> {
    const files = await Deno.readDir(sourceDir);
    for await (const file of files) {
        if (file.isDirectory) {
            continue;
        }
        const finalName = file.name.replace(".rename", "");
        let content = await Deno.readTextFile(path.join(sourceDir, file.name));
        for (const [regex, replacement] of Object.entries(replacements)) {
            content = content.replace(new RegExp(regex, 'g'), replacement);
        }
        await Deno.writeTextFile(path.join(targetDir, finalName), content);
    }
}   

// Get current directory
function currentDir(): string {
    const currentDir = path.dirname(path.fromFileUrl(import.meta.url));
    console.log({currentDir});
    return currentDir;
}

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

async function main(): Promise<void> {
    const { version,targetFolder, packageName } = checkInputs(Deno.args);

    const folders = [
        [""], 
        ["ignition", "modules"], 
        ["src", "contracts"]
    ];

    for (const folder of folders) {
        await Deno.mkdir(path.join(targetFolder, ...folder), { recursive: true });
    }

    for (const folder of folders) {
        await copyFiles(path.join(currentDir(), "template", ...folder), path.join(targetFolder, ...folder), {
            "\\[scope\\]": packageName,
            "\\[EFFECTSTREAM-VERSION\\]": version
        });
    }

};

await main();