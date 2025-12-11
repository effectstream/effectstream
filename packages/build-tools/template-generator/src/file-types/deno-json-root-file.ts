import { GeneratedFile } from './generated-file.ts';
import { Chain, Frontend, PAIMA_SCOPE, EFFECTSTREAM_VERSION } from '../options.ts';

export class RootDenoJsonFile extends GeneratedFile {
    private content: object;

    constructor(filePath: string, projectName: string, chains: Chain[], frontend: Frontend) {
        super(filePath);

        const tasks: Record<string, string> = {};
        const imports: Record<string, string> = {};

        // Conditional tasks
        if (chains.includes('evm')) {
            tasks['build:evm'] = `deno task -f @${projectName}/evm-contracts build:mod`;
        }
        if (chains.includes('midnight')) {
            tasks['build:midnight'] = `deno task -r compact`;
        }
        
        tasks['dev'] = `deno task -f @${projectName}/node dev`;

        if (frontend === 'intergrated-vite-deno') {
            tasks['start:frontend'] = `deno task -f @${projectName}/frontend dev`;
        }

        tasks['check'] = `deno task -f @${projectName}/node check`;

        // Conditional imports
        imports[`${PAIMA_SCOPE}/tui`] = `jsr:${PAIMA_SCOPE}/tui@${EFFECTSTREAM_VERSION}`;
        if (chains.includes('midnight')) {
            imports[`${PAIMA_SCOPE}/midnight-contracts`] = `jsr:${PAIMA_SCOPE}/midnight-contracts@${EFFECTSTREAM_VERSION}`;
        }
        if (chains.includes('evm')) {
            imports[`${PAIMA_SCOPE}/evm-contracts`] = `jsr:${PAIMA_SCOPE}/evm-contracts@${EFFECTSTREAM_VERSION}`;
        }
        imports['@std/path'] = 'jsr:@std/path@^1.1.2';
        
        this.content = {
            workspace: ['./packages/**/*'],
            nodeModulesDir: 'auto',
            tasks,
            imports,
            lint: {
                rules: {
                    exclude: [
                        'no-this-alias',
                        'require-yield',
                        'no-explicit-any',
                        'ban-types',
                        'no-unused-vars',
                        'no-slow-types',
                    ],
                },
            },
        };
    }

    getContent(): string {
        return JSON.stringify(this.content, null, 2);
    }
}
