import fs from 'node:fs/promises';
import path from 'node:path';
import ignore from 'ignore';    
import { isBinaryFile } from 'isbinaryfile';

const contexts = [
    { name: 'documentation', root: "./docs/site", path: '/docs', description: 'Current documentation for the Paima Engine' },
    { name: 'node-sdk', root: ".", path: '/packages/node-sdk', description: 'Node (Paima Engine Node) SDK' },
    { name: 'paima-sdk', root: ".", path: '/packages/paima-sdk', description: 'Frontend SDK for the Paima Engine' },
    { name: 'build-tools', root: ".", path: '/packages/build-tools', description: 'Tools for the Paima Engine' },
    { name: 'chains', root: ".", path: '/packages/chains', description: 'Chains for the Paima Engine' },
    { name: 'binaries', root: ".", path: '/packages/binaries', description: 'Binaries for the Paima Engine' },
    { name: 'example:e2e', root: ".", path: '/e2e', description: 'E2E tests for the Paima Engine' },
    { name: 'example:chess', root: "./templates/chess", path: '/', description: 'Chess template for the Paima Engine' },
    { name: 'example:evm-midnight', root: "./templates/evm-midnight", path: '/', description: 'EVM Midnight template for the Paima Engine' },
    { name: 'example:minimal', root: "./templates/minimal", path: '/', description: 'Minimal template for the Paima Engine' },
];

const globalFileIg = ignore().add([
    '.DS_Store',
    '_category_.json',
    '*.hbs',
    '.gitignore',
    '*.mn',
    'Cargo',
    '*.log',
    'settings.json',
    '.dockerignore',
    'Dockerfile',
    'patch.sh',
    '.npmrc',
    'package-lock.json',
    'deno.lock',
    'pgtypedconfig.json',
    'install.sh',
    '*.css',
    '*.scss',
    'identity.toml',
    'config.yml',
    "*-abi.ts",
]);

const globalPathIg = ignore().add([
    '**/evm-contracts/test/',
    '**/client/dist/',
    '**/docker-scripts',
]);

const LOG_DIR_REGEX = /\d{8}-\d{4}-\d{2}-\./;

async function* walk(dir: string): AsyncGenerator<string> {
    for await (const d of await fs.opendir(dir)) {
        const entry = path.join(dir, d.name);
        if (d.isDirectory()) yield* walk(entry);
        else if (d.isFile()) yield entry;
    }
}

async function processContext(context: any, outputDir: string, gitignoreCache: Map<string, string | null>) {
    const outputFilePath = `${outputDir}/${context.name}.txt`;
    let content = `<description>${context.description}</description>\n`;
    const includedFiles = [];

    const startPath = path.join(context.root, context.path);

    for await (const filePath of walk(startPath)) {
        if (filePath.includes('node_modules') || LOG_DIR_REGEX.test(filePath)) {
            continue;
        }

        if (globalFileIg.ignores(path.basename(filePath))) {
            continue;
        }

        const relativeToProjectRoot = path.relative(process.cwd(), filePath);
        if (globalPathIg.ignores(relativeToProjectRoot)) {
            continue;
        }

        if (await isBinaryFile(filePath)) {
            console.warn(`Skipping binary file: ${filePath}`);
            continue;
        }

        const dirs = [];
        let currentDir = path.dirname(filePath);
        while (currentDir.length >= context.root.length) {
            dirs.unshift(currentDir);
            if (currentDir === context.root) break;
            currentDir = path.dirname(currentDir);
        }

        const fileIg = ignore();
        for (const dir of dirs) {
            const gitignorePath = path.join(dir, '.gitignore');
            let gitignoreContent = gitignoreCache.get(gitignorePath);
            if (gitignoreContent === undefined) {
                try {
                    gitignoreContent = await fs.readFile(gitignorePath, 'utf8');
                    gitignoreCache.set(gitignorePath, gitignoreContent);
                } catch (e: any) {
                    if (e.code !== 'ENOENT') throw e;
                    gitignoreContent = null;
                    gitignoreCache.set(gitignorePath, gitignoreContent);
                }
            }

            if (gitignoreContent) {
                const relativeGitignorePath = path.relative(context.root, path.dirname(gitignorePath));
                fileIg.add(gitignoreContent.split('\n').map(line => {
                    if (line.trim() === '' || line.startsWith('#')) return '';
                    return path.join(relativeGitignorePath, line);
                }));
            }
        }

        const relativePath = path.relative(context.root, filePath);
        if (fileIg.ignores(relativePath)) {
            continue;
        }

        try {
            const fileContent = await fs.readFile(filePath, 'utf8');
            const displayPath = path.relative(startPath, filePath);
            content += `<file=${displayPath}>${fileContent}</file=${displayPath}>\n`;
            includedFiles.push(displayPath);
        } catch (e: any) {
            if (e.code === 'ENOENT') {
                // file was likely deleted between walk and read
            } else if (e.message.includes('illegal operation on a directory')) {
                // skip directories
            } else {
                console.error(`Error reading file ${filePath}:`, e);
            }
        }
    }

    await fs.writeFile(outputFilePath, content);
    console.log(`Generated ${outputFilePath}`);

    return { ...context, outputFilePath, includedFiles };
}

async function generateMarkdownIndex(processedContexts: any[], outputDir: string) {
    let markdownIndexContent = '# AI Context Index\n\nHere are the available contexts:\n\n';

    for (const context of processedContexts) {
        markdownIndexContent += `*   **${context.name}**: ${context.description}. (file: \`${context.outputFilePath}\`)\n`;
        if (context.includedFiles.length > 0) {
            markdownIndexContent += context.includedFiles.map((f: string) => `    *   \`${f}\``).join('\n') + '\n';
        }
    }

    const indexFilePath = path.join(outputDir, '..', 'ai-context-index.md');
    await fs.writeFile(indexFilePath, markdownIndexContent);
    console.log(`Generated ${indexFilePath}`);
}

async function main() {
    const outputDir = './ai-context';
    await fs.mkdir(outputDir, { recursive: true });
    const gitignoreCache = new Map<string, string | null>();

    const processedContexts = [];
    for (const context of contexts) {
        const processedContext = await processContext(context, outputDir, gitignoreCache);
        processedContexts.push(processedContext);
    }

    await generateMarkdownIndex(processedContexts, outputDir);
}

main().catch(console.error);
