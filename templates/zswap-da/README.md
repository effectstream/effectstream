NOTE Celestia node and bridge must be running to use the dapp.

```sh
# start the celestia node and bridge
./scripts/single-node.sh
./scripts/single-node-bridge.sh
# send some tokens to the validator
celestia-appd tx bank send validator celestia1pr90qtc4a7sc53x9tk7zv7sefjjl6tcwqkmg09 100000000utia \
  --fees 2000utia --chain-id test
```

```sh
# install dependencies
deno install --allow-scripts
# build contracts
deno task -f @zswap-da/contract-offer-files contract:compile
# start
deno task dev
```

```sh
# another terminal
cd packages/frontend
npm run dev
```
