import * as path from "@std/path";
import { copyFiles } from "./scaffold-helpers.ts";
import { currentDir } from "./scaffold-helpers.ts";

/* 
 * This module is responsible for scaffolding a new project.
 */
export async function scaffoldBitcoinProject(
    targetFolder: string, 
    packageName: string, 
    version: string,
): Promise<{
    name: string;
    path: string;
}> {
    const fullPackageName = `@${packageName}/bitcoin-contracts`;

    const folders = [
        [""], 
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
                }, 
            }
        );
    }

    return {
        name: fullPackageName,
        path: targetFolder
    }
};

export function bitcoinPrimitiveBlock(): string {
    return `
        .addPrimitive(
            (syncProtocols) => (syncProtocols as any).parallelBitcoin,
            (network, deployments, syncProtocol) => ({
                name: "BitcoinAddress",
                type: PrimitiveTypeBitcoinAddress,
                startBlockHeight: 101,
                watchAddress: "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03",
                stateMachinePrefix: "bitcoin-transaction",
            }),
        )
    `;
}

export function bitcoinGrammar(): {
    customGrammar: string;
    builtInGrammar: string;
} {
    return { 
        builtInGrammar: `"bitcoin-transaction": builtinGrammars.bitcoinAddress,`, 
        customGrammar: '',
    }
}

export function bitcoinStateMachine(): string {
    return `
        stm.addStateTransition("bitcoin-transaction", function* (data) {
            console.log(
                "🎉 [BITCOIN] Transaction receipt:",
                JSON.stringify(data.parsedInput)
            );
        });
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
    await scaffoldBitcoinProject(targetFolder, packageName, version);
}
