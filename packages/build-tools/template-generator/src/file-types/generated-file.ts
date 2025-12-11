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


