
```sh
# install dependencies
deno install --allow-scripts && ./patch.sh
# build contracts
deno task -f @minimal/evm-contracts build:mod
# start
deno task dev
```

```sh
# another terminal
cd packages/frontend
npm install
node esbuild.js
npx http-server .
```

Or use the Deno task:
```sh
deno task -f @minimal/frontend dev
```

## Run in Docker 
```sh
docker build . -f Dockerfile -t effectstream-minimal
docker run -p 8545:8545 -p 9999:9999 -p 3334:3334 -p 8080:8080 effectstream-minimal
# Open http://127.0.0.1/8080 in a browser
```
