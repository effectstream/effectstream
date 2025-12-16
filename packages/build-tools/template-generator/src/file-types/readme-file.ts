import { MarkdownFile } from './markdown-file.ts';
import { Chain } from '../options.ts';

export class MainReadmeFile extends MarkdownFile {
    constructor(filePath: string, projectName: string, chains: Chain[]) {
        super(filePath);

        const buildCommands = chains.map(chain => `deno task build:${chain}`).join('\n');
        const quickStartScript = `
# Check for external dependencies
./../check.sh

# Install packages
deno install --allow-scripts && ./patch.sh

# Compile contracts
${buildCommands}

# TODO this can be ran after the first launch of the node
# deno task -f @my-project-all pgtyped:update

# Launch Paima Engine Node
deno task dev
        `.trim();

        this.addHeader(`${projectName} Quick Start`)
            .addCodeBlock(quickStartScript)
            .addText('Open [http://localhost:10599](http://localhost:10599)');
    }
}
