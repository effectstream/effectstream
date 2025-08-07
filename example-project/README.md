# Install & Start

Get the repository
```
git clone https://github.com/acedward/paima-v-next-sample.git
cd paima-v-next-sample
```
Install dependencies
```sh
rm deno.lock
rm -rf node_modules
deno install --allow-scripts
./patch.sh
```
Deploy Contracts
```
deno task evm
```

Launch Node
```
deno task dev
```

# Pending Issues

- [ ] Add script to check dependencies (deno/node/forge) 

- [ ] Viem cannot link from @paimaexample/concise 
    ```
    Uncaught SyntaxError: The requested module '/@fs/Users/edwardalvarado/paima-sample/node_modules/.vite/deps/viem.js?v=03f2d257' does not provide an export named 'privateKeyToAccount' (at c20166c16b25e49e88ff55d6cc25071c46cbb54a2eec1884b340a04e6ceee450:7:10)
    ```

- [x] Fix npm instalation of https://jsr.io/@paimaexample/evm-contracts

    We need this a NPM dependency so that hardhat can use remappings.
    ```
    > npx jsr add @paimaexample/evm-contracts
    Installing @paimaexample/evm-contracts...
    $ npm install @paimaexample/evm-contracts@npm:@jsr/paimaexample__evm-contracts
    npm error Cannot read properties of null (reading 'package')
    npm error A complete log of this run can be found in: /Users/username/.npm/_logs/2025-07-23T22_59_30_206Z-debug-0.log
    Command: npm install @paimaexample/evm-contracts@npm:@jsr/paimaexample__evm-contracts
    CWD: /Users/username/paima-sample
    Output: 
    Child process exited with: 1
    ```

    NOTE We added a new package https://www.npmjs.com/package/@paimaexample/evm-contracts

- [x] Some tmux/tui launching issue
    ```
    tmux -f "./tmux.conf" new -d -s "paima-1753393573294"
    error: Uncaught (in promise) WouldBlock: Resource temporarily unavailable (os error 35)
    at Object.print (ext:core/01_core.js:678:28)
    at Console.<anonymous> (ext:runtime/98_global_scope_shared.js:136:46)
    at console.log (ext:deno_console/01_console.js:3139:20)
    at Object.transportFormatted (file:///Users/username/paima-sample/node_modules/.deno/tslog@4.9.3/node_modules/tslog/dist/esm/runtime/nodejs/index.js:107:13)
    at Logger.log (file:///Users/username/paima-sample/node_modules/.deno/tslog@4.9.3/node_modules/tslog/dist/esm/BaseLogger.js:101:32)
    at Logger.error (file:///Users/username/paima-sample/node_modules/.deno/tslog@4.9.3/node_modules/tslog/dist/esm/index.js:32:22)
    at https://jsr.io/@paimaexample/log/0.3.9/src/tslog.ts:154:18
    at https://jsr.io/@paimaexample/orchestrator/0.3.9/src/logging.ts:113:16
    at Object.tslogLog [as local] (https://jsr.io/@paimaexample/log/0.3.9/src/tslog.ts:153:3)
    at localLogHandler (https://jsr.io/@paimaexample/orchestrator/0.3.9/src/logging.ts:109:9)
    ```
    edit: subscript calls deno task -f @paimaexample/tui logs

- [ ] Launch Documentation. We cannot run scripts through tasks.

- [ ] Launch Explorer. We cannot run scripts `vue` throught task. 

- [x] Pass project name into orchestrator (now @example is hardcoded) - Do we enforce required scripts and namespaces?

- [ ] Some clean script references not available

- [ ] Clean up created files (workarounds for import with { type: text })

- [ ] Add Midnight Contracts & Wallet Connector

- [ ] Update to Midnight Paima Enginve Version

# Improvements

- [ ] We can have a better folder structure for new projects
