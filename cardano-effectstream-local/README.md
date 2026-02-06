IMPORTANT
- Provide a dolos binary in ./cardano-effectstream-local/packages/cardano/dolos
- Provide a yaci-cli binary in $HOME/.yaci-cli/yaci-cli

```sh
deno install --allow-scripts && ./patch.sh
deno task -f @minimal-cardano/midnight-contract-counter-basic contract:compile
deno task -f @minimal-cardano/node dev
```


This type of log is expected.
This means both midnight and utxorpc are syncing, and generating effectstream blocks.
```
00:15:13 INFO   effectstream-sync: [Midnight:undeployed] Fetching blocks from 11 to 11. 
00:15:13 INFO   effectstream-sync-ntp-mainNtp: [26]
00:15:13 INFO   effectstream-sync: [UTXORPC] Fetching blocks from 78 to 78. 
00:15:13 INFO   effectstream-sync-block-merge: producing block 26
00:15:13 INFO   effectstream-sync-block-merge: finalized block 26 @ 0x62909d... | {"mainNtp":[26,26],"parallelUtxoRpc":[77,77],"parallelMidnight":[10
```