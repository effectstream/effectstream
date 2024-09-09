
import 'dotenv/config';
//import contract from "../plutus.json" assert {type: 'json'};
import { HotWallet, Core, Blaze} from "@blaze-cardano/sdk";
import { Kupmios } from "@blaze-cardano/query";
import { Unwrapped } from "@blaze-cardano/ogmios";
import { U5C} from "@utxorpc/blaze-provider";
import { Command, Option } from '@commander-js/extra-typings';
//import { mint_token, burn_token, update_token, init_merkle, create_account } from './actions.js';
import { init_merkle } from './actions.js';
import { api_blockfrost, getValidators } from './util.js';
import fs from 'fs';

// Config: Flags ---------------------------------------------------------------

// Network
const previewOption = new Option('-p, --preview', 'Use testnet').default(true);

// Provider
const kupoUrlOption = new Option('-k, --kupo-url <string>', 'Kupo URL')
  .env('KUPO_URL')
  .makeOptionMandatory(false);
const ogmiosUrlOption = new Option('-o, --ogmios-url <string>', 'Ogmios URL')
  .env('OGMIOS_URL')
  .makeOptionMandatory(false);
const blockfrostUrlOption = new Option('-b, --blockfrost-url <string>', 'Blockfrost URL')
  .env('BLOCKFROST_URL')
  .makeOptionMandatory(false);
const utxoRPCOption = new Option('-u, --utxorpc-url <string>', 'UTXORPC URL')
  .env('UTXORPC_URL')
  .makeOptionMandatory(false);
const utxoRPCOptionKey = new Option('-k, --utxorpc-key <string>', 'UTXORPC KEY')
  .env('UTXORPC_KEY')
  .makeOptionMandatory(false);


// Extra
const txHash = new Option('-tx, --tx-hash', 'Transaction Hash')
  .env('tx_hash')
  .makeOptionMandatory(false);

// App -------------------------------------------------------------------------
const app = new Command();
app.name('minter').description('Inverse Whirlpool Minter').version('0.0.1');

// App Command: Init -----------------------------------------------------------
app
  .command('init_contract')
  .description('Initializes Contract')
  .addOption(previewOption)            // Network
  .addOption(utxoRPCOption)            // Provider Option
  .addOption(utxoRPCOptionKey)            // Provider Option
  .action(async ({ preview, utxorpcUrl, utxorpcKey }) => {

    // Provider Selection
    const provider = new U5C({
      url: utxorpcUrl!,
      headers: {
        "dmtr-api-key": utxorpcKey!
      }
    });

    console.log('Loading Wallet')

    const mnemonic = fs.readFileSync('seed.txt', { encoding: 'utf-8' })
    const entropy = Core.mnemonicToEntropy(mnemonic, Core.wordlist);
    const masterkey = Core.Bip32PrivateKey.fromBip39Entropy(Buffer.from(entropy), "");
    
    const wallet = await HotWallet.fromMasterkey(masterkey.hex(), provider);
    const blaze = await Blaze.from(provider, wallet);

    // Try to execute the TX
    try {
      const tx_info = await init_merkle(blaze)
    } catch (e) {
      console.log(e);
    }
  });

// App Command: Create Account -----------------------------------------------------------
app
  .command('create_account')
  .description('Creates an Account')
  .addOption(previewOption)            // Network
  .addOption(blockfrostUrlOption)      // Provider Option
  .addOption(kupoUrlOption)            // Provider Option
  .addOption(ogmiosUrlOption)          // Provider Option
  .action(async ({ preview }) => {

    // Set up wallet API and provider API to broadcast the built TX
    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await api_blockfrost(preview ? 'Preview' : 'Mainnet' )
    await lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    // Try to the parameterized contract code
    let parameterized_validator;
    try {
      parameterized_validator = await JSON.parse(fs.readFileSync('./data/param_script.json',{ encoding: 'utf-8' }));
    } catch (e) {
      console.log(e);
      console.log("No parameterized script in src/data found. Make sure to initialize the contract with init_contract first");
    }
    // Try to execute the TX
    try {
      const tx_info = await create_account(lucid, parameterized_validator)
    } catch (e) {
      console.log(e);
    }
  });

// App Command: Mint -----------------------------------------------------------
app
  .command('mint')
  .description('Mints a token with a verifiable metadata hash')
  .addOption(previewOption)            // Network
  .addOption(blockfrostUrlOption)      // Provider Option
  .addOption(kupoUrlOption)            // Provider Option
  .addOption(ogmiosUrlOption)          // Provider Option
  .action(async ({ preview }) => {

    // Try to the the built contract code
    let Validators;
    try {
      const contract = JSON.parse(fs.readFileSync('../plutus.json',{ encoding: 'utf-8' }));
      Validators = getValidators(contracts, contract);
    } catch (e) {
      console.log(e);
      console.log("No contract script found, ensure you've compiled the aiken code.");
      return
    }
    // Try to the parameterized contract code
    let parameterized_validator;
    try {
      parameterized_validator = await JSON.parse(fs.readFileSync('./data/param_script.json',{ encoding: 'utf-8' }));
    } catch (e) {
      console.log(e);
      console.log("No parameterized script in src/data found. Make sure to initialize the contract with init_contract first");
    }

    // Set up wallet API and provider API to broadcast the built TX
    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await api_blockfrost(preview ? 'Preview' : 'Mainnet' )
    await lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));
   
    // Initialize Lucid ----------------------------------------------------------

    // Try to execute the TX
    try {
      const tx_info = await mint_token(lucid, Validators, parameterized_validator)
    } catch (e) {
      console.log(e);
    }
  });

// App Command: Burn -----------------------------------------------------------
app
  .command('burn')
  .description('Burns a token')
  .addOption(previewOption)            // Network
  .addOption(blockfrostUrlOption)      // Provider Option
  .addOption(kupoUrlOption)            // Provider Option
  .addOption(ogmiosUrlOption)          // Provider Option
  .action(async ({ preview }) => {

    // Set up wallet API and provider API to broadcast the built TX
    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await api_blockfrost(preview ? 'Preview' : 'Mainnet' )
    await lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    // Try to execute the TX
    try {
      const tx_info = await burn_token(lucid)
    } catch (e) {
      console.log(e);
    }
  });


// App Command: Update -----------------------------------------------------------
app
  .command('update')
  .description("Updates a token's metadata")
  .addOption(previewOption)            // Network
  .addOption(blockfrostUrlOption)      // Provider Option
  .addOption(kupoUrlOption)            // Provider Option
  .addOption(ogmiosUrlOption)          // Provider Option
  .action(async ({ preview }) => {

    // Set up wallet API and provider API to broadcast the built TX
    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    const lucid = await api_blockfrost(preview ? 'Preview' : 'Mainnet' )
    await lucid.selectWalletFromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));

    // Try to execute the TX
    try {
      const tx_info = await update_token(lucid)
    } catch (e) {
      console.log(e);
    }
  });

// App Command: Watches for TX Settlement ----------------------------------------------
app
  .command('checkTX')
  .addOption(previewOption)            // Network
  .addOption(blockfrostUrlOption)      // Provider Option
  .addOption(kupoUrlOption)            // Provider Option
  .addOption(ogmiosUrlOption)          // Provider Option
  .addOption(txHash)                   // Transaction Hash
  .description('Waits for a TX to settle on the blockchain')
  .action(async ({ options, preview }) => {
    
    // Set up wallet API and provider API to broadcast the built TX
    // const provider = new Kupmios(kupoUrl, ogmiosUrl);
    console.log('Option info: ', txHash)

    console.log('Awaiting transaction settlement for hash: ', options)
    const lucid = await api_blockfrost(preview ? 'Preview' : 'Mainnet' )
    //const txSuccess = await lucid.awaitTx(txHash)

  });

// App Command: Initialize Wallet ----------------------------------------------
// Generates a new wallet
app
  .command('init')
  .description('Initialize a minting ')
  .action(() => {

    console.log(`Generating seed phrase...`);
    const seed = generateSeedPhrase();

    fs.writeFileSync('seed.txt', seed, { encoding: 'utf-8' });

    console.log(`Minting wallet initialized and saved to seed.txt`);  
    console.log(`For testnet faucet, visit: https://docs.cardano.org/cardano-testnets/tools/faucet/`);
  });

app.parse();
