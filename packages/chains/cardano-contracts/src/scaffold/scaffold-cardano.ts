import * as path from "jsr:@std/path";

/* 
 * This module is responsible for scaffolding a new project.
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
            const r = `\\/\\*\\* ${codeBlock} \\*\\/([\\s\\S]+?)\\/\\*\\* ${codeBlock} \\*\\/`;
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

export async function scaffoldCardanoProject(
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
    const fullPackageName = `@${packageName}/cardano-contracts`;

    const folders = [
        [""], 
        [""],
        ["config"],
        ["temp"],
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
                    "scope": packageName,
                    "EFFECTSTREAM-VERSION": version
                },
            }
        );
    }

    return {
        name: fullPackageName,
        path: targetFolder
    }
};

export function cardanoPrimitiveBlock(): string {
    return ``;
}

export function cardanoGrammar(): {
    customGrammar: string;
    builtInGrammar: string;
} {
    return { 
        builtInGrammar: '', 
        customGrammar: '',
    }
}

export function cardanoStateMachine(): string {
    return ``;
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
    await scaffoldCardanoProject(targetFolder, packageName, version, []);
}
