# inverse-whirlpool

A smart contract for minting Cardano native tokens with updatable CIP-25 metadata.

## Overview

This application consists of two validator files:

- `validators/true.ak`
- `validators/whirl.ak`

A token is minted using the `true.mint` validator where the token name is encoded as the script datum hash. In the same transaction, a token is minted using the `whirl.mint` validator. The minting script in `whirl.mint` internally re-serializes the transaction into CBOR and compares the resulting `blake2b_256` hashes (tx id). If the hashes match then the token metadata is unchanged. Conversely, if the token metadata was altered, the tx_id from `truk.ak` will no longer match the script datum's hash. Using this methodology, we are now able to implement low level control logic operations on a token's metadata.

## Building

To compile the contract, execute the following command in the root directory of this project:

For testnet:
```sh
aiken b -t verbose --env preview \
&& aiken blueprint convert -v always > src/scripts/true.json \
&& aiken blueprint convert -v merkle > src/scripts/whirl.json \
&& aiken blueprint convert -v paima_mint > src/scripts/paima.json

```

For mainnet
```sh
aiken b --env mainnet & 
&& aiken blueprint convert -v always > src/scripts/true.json \
&& aiken blueprint convert -v merkle > src/scripts/whirl.json \
&& aiken blueprint convert -v paima_mint > src/scripts/paima.json
```

A `plutus.json` file will be generated along with a set of scripts in `src/scripts`

## Testing

To run all tests, simply do:

```sh
aiken check
```

To run only tests matching the string `foo`, do:

```sh
aiken check -m foo
```


## Executing

To execute on-chain, some `nodejs` based off-chain code is provided in the `src` directory for a CLI based interaction. The `node` version used in developing this application was: `v20.2.0`

The set of actions:

* init_contract
* create_account
* mint
* burn
* update

### Set Up

#### Installation

Make sure you first the contract scripts in the previous section, next, run `pnpm install` to install the required `node` packages for the CLI application. Next, set up a `.env` file with API keys for a provider. Not all variables must be defined, only at minimum the provider you choose to work with. The default provider Blockfrost. Your `.env` may look like so:
```
DEMETER=<Demeter API Key>
KUPO_URL="https://<network>.<Kupo URL>"
OGMIOS_URL="wss://<Ogmios URL>"
BLOCKFROST_PREVIEW=<network><key>
```
A provider is used to broadcast the transaction to the network. API keys may be obtained from the providers here:
* [Demeter](https://demeter.run/)
* [Blockfrost](https://blockfrost.io/)

#### Wallet

To set up a wallet for this command, replacing `<wallet-name>` with the name of your wallet.
``` bash
pnpm run execute wallet-new <wallet-name>
```
or alternatively execute the `tests/Setup.sh` script where it will guide you on funding with `tAda` and will default the name to `user_1` as the expected wallet name for test case execution.

Testnet may be obtained at this [faucet](https://docs.cardano.org/cardano-testnets/tools/faucet/).


### Initialization

To instantiate the contract, execute the following command:

``` bash
pnpm run execute init_contract
```

This mints a null assetname token into the contract with the policy ID of the merkle minter validator.

Contract uniqueness is enforced through using the spent eUTXO as a parameter input for the contract. The contract parameters are saved in `data/param_script.json` for convenience and the merkle tree is stored in `data/merkle_forest_db`




### Creating an Account

An account tracks tokens in circulation and tracks metadata changes.

A record is inserted 


```
pnpm run execute create_account
```


### Minting
To mint an initial token, you can define metadata in the `metadata.json` file, and execute the following command. A sample `metadata.json` file is provided.
```
pnpm run execute mint
```
You can append a `-p` or `--preview` flag to the command to execute on the test network.
```
pnpm run execute mint -p
```


### Minting
To mint an initial token, you can define metadata in the `metadata.json` file, and execute the following command. A sample `metadata.json` file is provided.
```
pnpm run execute mint
```
You can append a `-p` or `--preview` flag to the command to execute on the test network.
```
pnpm run execute mint -p
```

### Burning

You may burn your token
```
pnpm run execute burn
```
You can append a `-p` or `--preview` flag to the command to execute on the test network.
```
pnpm run execute burn -p
```

### Updating metadata

You may update the token metadata by changing the default `metadata.json` file, or creating a new metadata file and pointing to it with the `-m` or `--metadata` flag.
```
pnpm run execute update
```
You can append a `-p` or `--preview` flag to the command to execute on the test network.
```
pnpm run execute update -p
```

## Resources

Find more on the [Aiken's user manual](https://aiken-lang.org).
