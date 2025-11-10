import { GeneratedFile } from './index.ts';

export class GitignoreFile extends GeneratedFile {
    constructor(filePath: string) {
        super(filePath);
    }

    getContent(): string {
        return `
**/node_modules
forge-std
logs/

# e2e tests
/cache
/out

# Frontend
.vite

# Batcher file storage
batcher-data/
midnight-level-db/

# Docusaurus
.docusaurus/

# System files
.DS_Store

# Temporary files
packages/client/node/tmux.conf
packages/client/node/install.sh
        `.trim();
    }
}
