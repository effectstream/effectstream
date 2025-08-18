# Install & Start

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
