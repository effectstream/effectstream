import { GeneratedFile } from './generated-file.ts';

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


