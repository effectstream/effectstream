import * as path from "jsr:@std/path";

// Copy files
// sourceDir - source directory
// targetDir - target directory
//
// replacements - simple [TAG] -> `code` replacement
// codeBlocks - enable/disable /** TAG */ ... /** TAG */
// codeInsertions - replace /** TAG */ with `code`
// replaceFileNames - x => y
export async function copyFiles(
    sourceDir: string, 
    targetDir: string, 
    replacements: Record<string, string> = {},
    codeBlocks: Record<string, boolean> = {},
    codeInsertions: Record<string, string> = {},
    replaceFileNames: Record<string, string> = {},
): Promise<void> {
    const files = await Deno.readDir(sourceDir);
    await Deno.mkdir(targetDir, { recursive: true });

    for await (const file of files) {
        if (file.isDirectory) {
            continue;
        }
        let finalName = file.name.replace(".rename", "");
        if (replaceFileNames[finalName]) {
            finalName = replaceFileNames[finalName];
        }

        let content = await Deno.readTextFile(path.join(sourceDir, file.name));
        
        // Enable/disable entire inlined code blocks
        for (const [codeBlock, enabled] of Object.entries(codeBlocks)) {
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
        for (const [r, code] of Object.entries(codeInsertions)) {
            // Search for tags /** TAG */
            const regex = new RegExp(`\\/\\*\\* ${r} \\*\\/`, 'g');
            content = content.replace(regex, code);
        }
        
        // Replace placeholders with actual values
        for (const [r, replacement] of Object.entries(replacements)) { 
            // Replace tags in [TAG] format
            const regex = new RegExp(`\\[${r}\\]`, 'g');
            content = content.replace(regex, replacement);
        }
        
        await Deno.writeTextFile(path.join(targetDir, finalName), content);
    }
}

// // Get current directory - this has to be JSR compatible.
// export function currentDir(): string {
//     return path.dirname(path.fromFileUrl(import.meta.url));
// }
