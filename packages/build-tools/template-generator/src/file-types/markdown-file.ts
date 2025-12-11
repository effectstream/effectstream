import { GeneratedFile } from './generated-file.ts';

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


