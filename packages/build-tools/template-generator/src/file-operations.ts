import * as path from "jsr:@std/path";

// Copy files
export async function copyFiles(
    sourceDir: string, 
    targetDir: string, 
    replacements: Record<string, string> = {},
    codeBlocks: Record<string, boolean> = {},
): Promise<void> {
    const files = await Deno.readDir(sourceDir);
    await Deno.mkdir(targetDir, { recursive: true });

    for await (const file of files) {
        if (file.isDirectory) {
            continue;
        }
        const finalName = file.name.replace(".rename", "");

        let content = await Deno.readTextFile(path.join(sourceDir, file.name));
        
        for (const [codeBlock, enabled] of Object.entries(codeBlocks)) {
            const r = `\\/\\*\\* ${codeBlock} \\*\\/([\\s\\S]+)\\/\\*\\* ${codeBlock} \\*\\/`;
            console.log(r);
            const regex = new RegExp(r, 'g');
            if (enabled) {
                content = content.replace(regex, `$1`);
            } else {
                content = content.replace(regex, '');
            }
        }
        

        for (const [regex, replacement] of Object.entries(replacements)) {
            content = content.replace(new RegExp(regex, 'g'), replacement);
        }
        
        await Deno.writeTextFile(path.join(targetDir, finalName), content);
    }
}   

// // Get current directory - this has to be JSR compatible.
// export function currentDir(): string {
//     return path.dirname(path.fromFileUrl(import.meta.url));
// }
