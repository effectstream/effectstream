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

            yield* World.resolve(insertData, { 
                chain: "bitcoin", 
                action: "transaction", 
                data: JSON.stringify(data.parsedInput), 
                block_height: data.blockHeight
            });
        });
    `;
}

