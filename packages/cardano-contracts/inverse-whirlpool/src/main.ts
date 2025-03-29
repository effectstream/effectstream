import 'dotenv/config';
import { Command, Option } from '@commander-js/extra-typings';
import { Lucid, Blockfrost, Kupmios, PROTOCOL_PARAMETERS_DEFAULT, generateSeedPhrase, scriptFromNative, paymentCredentialOf } from "@lucid-evolution/lucid";
import { init_merkle, create_account, mint_root_token } from './actions';
import { colors } from './util';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const VERBOSE = true;
const WALLET_DIR = 'wallets';

// Ensure wallet directory exists
if (!fs.existsSync(WALLET_DIR)) {
  console.log('Creating wallet directory...');
  fs.mkdirSync(WALLET_DIR);
}

// Config: Option Flags --------------------------------------------------------
const previewOption = new Option('-p, --preview', 'Use testnet').default(true);
const kupoUrlOption = new Option('-k, --kupo-url <string>', 'Kupo URL')
  .env('KUPO_URL')
  .makeOptionMandatory(false);
const ogmiosUrlOption = new Option('-o, --ogmios-url <string>', 'Ogmios URL')
  .env('OGMIOS_URL')
  .makeOptionMandatory(false);
const addressOption = new Option('-a, --address <address>', 'Contract Address')
  .makeOptionMandatory();
const datumOption = new Option('-d, --datum <path>', 'Path to datum.json file');
const metadatumOption = new Option('-m, --metadatum <path>', 'Path to metadatum.json file').default('data/metadata.json');
const walletOption = new Option('-w, --wallet <name>', 'Wallet to use')
  .makeOptionMandatory();

// Wallet management functions
const generateWallet = async (name: string) => {
  const seed = generateSeedPhrase();
  const walletPath = `${WALLET_DIR}/${name}.json`;
  
  if (fs.existsSync(walletPath)) {
    throw new Error(`Wallet ${name} already exists`);
  }
  
  fs.writeFileSync(walletPath, JSON.stringify({ seed }));
  return seed;
};

const loadWallet = async (API: any, name: string) => {

  console.log(`${colors.cyan}INFO${colors.reset}: Loading Wallet...`);
  const walletPath = `${WALLET_DIR}/${name}.json`;
  if (!fs.existsSync(walletPath)) {
    throw new Error(`Wallet ${name} not found`);
  }
  
  const { seed } = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  API.selectWallet.fromSeed(seed);

  let address = await API.wallet().address()
  console.log(`${colors.magenta}User Address${colors.reset}:`, address);
  console.log(`${colors.magenta}Payment Credential${colors.reset}: ${await paymentCredentialOf(address).hash}`);

  return address;
}

export const loadContract = async (address: string) => {
  console.log(`${colors.cyan}INFO${colors.reset}: Loading Contract...`);

  const dir_contract = 'data/contracts/' + address;
  const parameterized_script = await JSON.parse(fs.readFileSync(dir_contract+'/param_script.json', { encoding: 'utf-8' }))
  const state = await JSON.parse(fs.readFileSync(dir_contract+'/state.json', { encoding: 'utf-8' }))

  console.log(`${colors.magenta}Contract Address${colors.reset}:`, address);

  if (VERBOSE) {
    console.log(colors.yellow + "Current Contract State" + colors.reset+":");
    console.dir(state, { depth: null });
  }

  return {'script': parameterized_script, 'state': state}
}


export const loadMetadata= async (path: string) => {
  console.log(`${colors.cyan}INFO${colors.reset}: Loading Metadata...`);
  console.log(`${colors.magenta}from path${colors.reset}:`, path);
  const metadata = await JSON.parse(fs.readFileSync(path, { encoding: 'utf-8' }))
  return metadata
}


// App -------------------------------------------------------------------------
const app = new Command();
app.name('minter').description('Inverse Whirlpool Minter').version('0.0.1');


// App Command: Generate Wallet ----------------------------------------------
app
.command('wallet-new')
.description('Generate a new wallet')
.argument('<name>', 'Name of the wallet')
.action(async (name) => {
  try {
    const seed = await generateWallet(name);
    console.log(`Wallet ${name} created successfully`);
    
    // Initialize API to get address
    const API = await Lucid(
      new Kupmios(
        process.env.KUPO_ENDPOINT_PREVIEW,
        process.env.OGMIOS_ENDPOINT_PREVIEW
      ),    
      "Preview"
    );
    
    API.selectWallet.fromSeed(seed);
    const address = await API.wallet().address();
    console.log(`Address: ${address}`);
  } catch (e) {
    console.log(e);
  }
});

// App Command: List Wallets -----------------------------------------------
app
.command('wallet-list')
.description('List all wallets')
.action(() => {
  const wallets = fs.readdirSync(WALLET_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => file.replace('.json', ''));
  console.log('Available wallets:');
  wallets.forEach(wallet => console.log(`- ${wallet}`));
});

// App Command: Init Contract ------------------------------------------------
app
.command('init_contract')
.description('Initializes Contract')
.addOption(previewOption)
.addOption(kupoUrlOption)
.addOption(ogmiosUrlOption)
.addOption(walletOption)
.action(async ({ preview, wallet }) => {
  const API = await Lucid(
    new Kupmios(
      process.env.KUPO_ENDPOINT_PREVIEW,
      process.env.OGMIOS_ENDPOINT_PREVIEW
    ),    
    "Preview"
  );
  
  const userAddress = await loadWallet(API, wallet);

  try {

    // Execute Transaction
    const tx_info = await init_merkle(API);
    console.log(`${colors.green}Contract Successfully Initialized${colors.reset}
      Contract data stored at: ${colors.yellow}data/contracts/${tx_info.address}${colors.reset}
      ${colors.magenta}Contract Address${colors.reset}: ${tx_info.address}
      ${colors.magenta}Contract Policy${colors.reset}: ${tx_info.policy_id}`);
      
    // Await Settlement
    console.log(`${colors.cyan}INFO${colors.reset}: Awaiting TX Settlement...`);
    const settled = await API.awaitTx(tx_info.tx_id);
    console.log(`TX Settled: ${settled ? colors.green + settled + colors.reset : colors.red + settled + colors.reset}`);

  } catch (e) {
    console.log(e);
  }
});

// App Command: Create Account ----------------------------------------------
app
.command('create_account')
.description('Creates an Account')
.addOption(previewOption)
.addOption(addressOption)
.addOption(walletOption)
.action(async ({ preview, address, wallet }) => {
  const API = await Lucid(
    new Kupmios(
      process.env.KUPO_ENDPOINT_PREVIEW,
      process.env.OGMIOS_ENDPOINT_PREVIEW
    ),    
    "Preview"
  );

  const userAddress = await loadWallet(API, wallet);

  const contract = await loadContract(address)

  try {
    const tx_info = await create_account(API, contract);

    // Await Settlement
    console.log(`${colors.cyan}INFO${colors.reset}: Awaiting TX Settlement...`);
    const settled = await API.awaitTx(tx_info.tx_id);
    console.log(`TX Settled: ${settled ? colors.green + settled + colors.reset : colors.red + settled + colors.reset}`);

  } catch (e) {
    console.log(e);
  }
});

// App Command: Mint Token -------------------------------------------------
app
.command('mint')
.description('Mints a token with a verifiable metadata hash')
.addOption(previewOption)
.addOption(walletOption)
.addOption(addressOption)
.addOption(metadatumOption)
.action(async ({ preview, address, wallet, metadatum }) => {
  const API = await Lucid(
    new Kupmios(
      process.env.KUPO_ENDPOINT_PREVIEW,
      process.env.OGMIOS_ENDPOINT_PREVIEW
    ),    
    "Preview"
  );


  await loadWallet(API, wallet);

  const contract_merkle_minter_paramed = await loadContract(address)
  //const contract_metadata_minter = await loadContract(address)
  const metadata = await loadMetadata(metadatum)

  try {
    const tx_info = await mint_root_token(API, 
      contract_merkle_minter_paramed,
      metadata
    );
    const settled = await API.awaitTx(tx_info.tx_id);
    console.log(`TX Settled: ${settled ? colors.green + settled + colors.reset : colors.red + settled + colors.reset}`);
  } catch (e) {
    console.log(e);
  }
});

// App Command: Burn Token -------------------------------------------------
app
.command('burn')
.description('Burns a token')
.addOption(previewOption)
.action(async ({ preview }) => {
  const API = await Lucid(
    new Kupmios(
      process.env.KUPO_ENDPOINT_PREVIEW,
      process.env.OGMIOS_ENDPOINT_PREVIEW
    ),    
    "Preview"
  );

  console.log('Loading Wallet...');
  await API.selectWallet.fromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));
  const address = await API.wallet().address();
  console.log('User Address:', address);

  try {
    const tx_info = await burn_token(API);
    const settled = await API.awaitTx(tx_info.tx_id);
    console.log(`TX Settled: ${settled}`);
  } catch (e) {
    console.log(e);
  }
});

// App Command: Update Token ----------------------------------------------
app
.command('update')
.description("Updates a token's metadata")
.addOption(previewOption)
.action(async ({ preview }) => {
  const API = await Lucid(
    new Kupmios(
      process.env.KUPO_ENDPOINT_PREVIEW,
      process.env.OGMIOS_ENDPOINT_PREVIEW
    ),    
    "Preview"
  );

  console.log('Loading Wallet...');
  await API.selectWallet.fromSeed(fs.readFileSync('seed.txt', { encoding: 'utf-8' }));
  const address = await API.wallet().address();
  console.log('User Address:', address);

  try {
    const tx_info = await update_token(API);
    const settled = await API.awaitTx(tx_info.tx_id);
    console.log(`TX Settled: ${settled}`);
  } catch (e) {
    console.log(e);
  }
});

app.parse();
