
```sh
# install dependencies
deno install --allow-scripts && ./../../patch.sh
# build contracts
deno task -f @minimal/evm-contracts build:mod
# start
deno task -f @minimal/node dev
```

```sh
# another terminal
cd frontend
node esbuild.js
npx http-server .
```


