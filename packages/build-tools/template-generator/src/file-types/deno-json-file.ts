import { GeneratedFile } from './generated-file.ts';

export class DenoJsonFile extends GeneratedFile {
    constructor(filePath: string, private content: any) {
        super(filePath);
        if (!this.content.name) {
            throw new Error('Name is required');
        }
        if (!this.content.exports) {
            this.content.exports = {
                // This is a placeholder
                ".": "./src/mod.ts",
            };
        }
    }
    
    getContent(): string {
        return JSON.stringify(this.content, null, 2);
    }
}


