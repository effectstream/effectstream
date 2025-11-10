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
async function copyFiles(sourceDir: string, targetDir: string): Promise<void> {
    const files = await Deno.readDir(sourceDir);
    for await (const file of files) {
        if (file.isDirectory) {
            continue;
        }
        const finalName = file.name.replace(".rename", "");
        await Deno.copyFile(path.join(sourceDir, file.name), path.join(targetDir, finalName));
    }
}   

// current directory
function currentDir(): string {
    const currentDir = path.dirname(path.fromFileUrl(import.meta.url));
    console.log({currentDir});
    return currentDir;
}

async function main(): Promise<void> {
    const targetFolder = Deno.args[2];
    if (!targetFolder) {
        console.error("Target folder is required");
        Deno.exit(1);
    }

    // Create target folder and subfolders
    const targetFolders: string[] = [path.join(targetFolder, "ignition"), path.join(targetFolder, "src/contracts")];
    for (const folder of targetFolders) {
        await Deno.mkdir(folder, { recursive: true });
    }

    await copyFiles(path.join(currentDir(), "template"), path.join(targetFolder));
    await copyFiles(path.join(currentDir(), "template"), path.join(targetFolder, "ignition"));
    await copyFiles(path.join(currentDir(), "template"), path.join(targetFolder, "src/contracts"));

};

await main();