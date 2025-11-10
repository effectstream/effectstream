import path from 'node:path';
import fs from 'node:fs/promises';

export abstract class GeneratedFile {
    constructor(public filePath: string) {}

    protected abstract getContent(): string;

    public async write(): Promise<void> {
        const dir = path.dirname(this.filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(this.filePath, this.getContent());
    }
}

export class DenoJsonFile extends GeneratedFile {
    constructor(filePath: string, private content: object) {
        super(filePath);
    }

    getContent(): string {
        return JSON.stringify(this.content, null, 2);
    }
}

export class TypescriptFile extends GeneratedFile {
    constructor(filePath: string, private content: string) {
        super(filePath);
    }

    getContent(): string {
        return this.content;
    }
}

export class SolidityFile extends GeneratedFile {
    constructor(filePath: string, private contractName: string) {
        super(filePath);
    }

    getContent(): string {
        return `// SPDX-License-Identifier: UNLICENSED\npragma solidity ^0.8.20;\n\ncontract ${this.contractName} {}\n`;
    }
}

export class SqlFile extends GeneratedFile {
    constructor(filePath: string, private content: string) {
        super(filePath);
    }



    getContent(): string {
        return this.content;
    }
}

export class HtmlFile extends GeneratedFile {
    constructor(filePath: string, private title: string, private scriptSrc: string) {
        super(filePath);
    }

    getContent(): string {
        return `<!DOCTYPE html>
<html>
<head>
    <title>${this.title}</title>
</head>
<body>
    <script src="${this.scriptSrc}"></script>
</body>
</html>`;
    }
}

export class MarkdownFile extends GeneratedFile {
    protected lines: string[] = [];

    constructor(filePath: string) {
        super(filePath);
    }

    addHeader(text: string, level: 1 | 2 | 3 | 4 | 5 | 6 = 1): this {
        this.lines.push(`${'#'.repeat(level)} ${text}`);
        return this;
    }

    addText(text: string): this {
        this.lines.push(text);
        return this;
    }

    addCodeBlock(code: string, language = 'sh'): this {
        this.lines.push(`\`\`\`${language}\n${code}\n\`\`\``);
        return this;
    }

    getContent(): string {
        return this.lines.join('\n\n');
    }
}

export class PackageJsonFile extends GeneratedFile {
    constructor(filePath: string, private content: object) {
        super(filePath);
    }

    getContent(): string {
        return JSON.stringify(this.content, null, 2);
    }
}
