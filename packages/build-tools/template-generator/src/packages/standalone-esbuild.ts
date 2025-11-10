import path from 'node:path';
import { Package, PackageInfo } from './abstract-package.ts';
import { PackageJsonFile, TypescriptFile, HtmlFile, GeneratedFile } from '../file-types/index.ts';

class StandalonePackageJson extends PackageJsonFile {
    constructor(filePath: string, projectName: string) {
        const content = {
            name: `${projectName}-frontend-esbuild`,
            version: "1.0.0",
            main: "index.js",
            type: "module",
            scripts: {
                test: "echo \"Error: no test specified\" && exit 1"
            },
            author: "",
            license: "ISC",
            description: "",
            dependencies: {
                "@paimaexample/wallets": "npm:@jsr/paimaexample__wallets@0.3.99",
                "viem": "^2.37.5"
            },
            devDependencies: {
                "esbuild": "0.25.9",
                "esbuild-plugins-node-modules-polyfill": "^1.7.1"
            }
        };
        super(filePath, content);
    }
}

class StandaloneEsbuildFile extends TypescriptFile {
    constructor(filePath: string) {
        const content = `import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";
import { build } from "esbuild";
build({
  entryPoints: ["./index.js"],
  bundle: true,
  outfile: "min.js",
  sourcemap: true,
  plugins: [
    nodeModulesPolyfillPlugin({
      globals: {
        process: true,
        Buffer: true,
      },
    }),
  ],
});`;
        super(filePath, content);
    }
}

class StandaloneIndexJsFile extends TypescriptFile {
    constructor(filePath: string) {
        const content = `import {
  allInjectedWallets,
  EffectstreamEngineConfig,
  sendTransaction,
  walletLogin,
  WalletMode,
} from "@paimaexample/wallets";

import { hardhat } from "viem/chains";

export const effectStreamConfig = new EffectstreamEngineConfig(
  "",
  "mainEvmRPC",
  "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  hardhat,
  undefined,
  undefined,
  false,
);

let wallet = null;
async function login() {
  const result = await walletLogin({
    mode: WalletMode.EvmInjected,
    chain: effectStreamConfig.paimaL2Chain,
  });
  if (!result.success) throw new Error("Cannot login");
  wallet = result.result;
  return wallet;
}

async function sendTransactionPaimaL2(input) {
  const result = await sendTransaction(
    wallet,
    ["my_action_name", input ?? "no-text"],
    paimaEngineConfig,
  );
  return result;
}

window.effectstream = {
  login,
  sendTransactionPaimaL2,
};`;
        super(filePath, content);
    }
}

class StandaloneIndexHtmlFile extends HtmlFile {
    constructor(filePath: string, projectName: string) {
        const content = `<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
    <link rel="stylesheet" href="style.css" />
</head>

<body>
    <div class="container">
        <h2>Connect Wallet</h2>
        <div id="address">Not connected</div>
        <button id="login" onclick="walletLogin()">Connect Wallet</button>
        <br />
        <br />
        <h2>Send Transaction to PaimaL2 Contract</h2>
        <input id="transaction-input" type="text" value="" placeholder="Enter your message" />
        <button id="Sent TX to Paima L2" onclick="sendTransactionPaimaL2()">
            Send TX
        </button>
        <hr />
        <h2>PaimaL2 Contract: Data Received</h2>
        <button onclick="fetchAccountingData()">Refresh Paima L2 data</button>
        <pre id="accounting-data"></pre>
    </div>
</body>

</html>

<script type="module" src="./min.js"></script>

<script>
    function hexToString(hex) {
        if (!hex.startsWith("0x")) return hex;
        return decodeURIComponent(hex.slice(2).replace(/(..)/g, "%$1"));
    }

    async function fetchAccountingData() {
        const response = await fetch(
            "http://localhost:9999/fetch-primitive-accounting"
        );
        const data = await response.json();
        data.sort((a, b) => b.id - a.id);
        document.getElementById("accounting-data").innerText = JSON.stringify(
            data,
            null,
            2
        );
    }

    async function walletLogin() {
        console.log(window.effectstream);
        const result = await effectstream.login();
        const { metadata, provider } = result;
        const { address: address1 } = provider;
        const address2 = await provider.getAddress();
        console.log(provider);
        console.log({ address1, address2 });
        document.getElementById("address").innerText = address2.address;
    }

    async function sendTransactionPaimaL2() {
        const input = document.getElementById("transaction-input").value;
        const result = await effectstream.sendTransactionPaimaL2(input);
        console.log(result);
        await fetchAccountingData();
    }
</script>`;
        super(filePath, content, 'src/index.ts');
    }

     public override getContent(): string {
        return this.filePath; // bit of a hack to get the full html content
    }
}

class StandaloneGitignoreFile extends GeneratedFile {
    constructor(filePath: string) {
        super(filePath);
    }

    getContent(): string {
        return `node_modules
min.js
min.js.map`;
    }
}

class StandaloneNpmrcFile extends GeneratedFile {
    constructor(filePath: string) {
        super(filePath);
    }

    getContent(): string {
        return '@jsr:registry=https://npm.jsr.io';
    }
}

export class StandaloneEsbuildPackage extends Package {
    public async generate(): Promise<PackageInfo | null> {
        if (!this.options.frontends.includes('standalone-esbuild')) {
            return null;
        }

        const frontendPath = path.join(this.projectPath, 'frontend', 'standalone');
        const packageName = `${this.options.projectName}-frontend-esbuild`;

        await new StandalonePackageJson(path.join(frontendPath, 'package.json'), this.options.projectName).write();
        await new StandaloneEsbuildFile(path.join(frontendPath, 'esbuild.js')).write();
        await new StandaloneIndexJsFile(path.join(frontendPath, 'index.js')).write();
        await new StandaloneIndexHtmlFile(path.join(frontendPath, 'index.html'), this.options.projectName).write();
        await new StandaloneGitignoreFile(path.join(frontendPath, '.gitignore')).write();
        await new StandaloneNpmrcFile(path.join(frontendPath, '.npmrc')).write();

        return { name: packageName, path: frontendPath };
    }
}
