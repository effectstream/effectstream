import Validator_Metadata_Minter from "../scripts/paima.json" assert { type: "json" };
//import Validator_Metadata_Minter from "../scripts/true.json" assert { type: "json" };
import { buildPseudoTX } from './index.ts';
import blake2b from 'blake2b';
import {
  paymentCredentialOf,
  Constr,
  Data,
  fromText,
  fromHex,
  applyParamsToScript,
  validatorToScriptHash,
  validatorToAddress,
  toHex
} from "@lucid-evolution/lucid";
import {bigIntReplacer, colors} from "../util.js"

// #############################################################################
// ## Helper Functions
// #############################################################################

function convertInputToCbor(input) {
  return new Constr(0, [
    fromText(input.txHash),  // Convert to ByteArray
    BigInt(input.outputIndex)
  ]);
}

function formatValue(value: { lovelace: bigint }) {
  return new Constr(0, [value.lovelace]); // For pure ADA output
}

// #############################################################################
// ## MINT TOKEN
// #############################################################################
export const mint_root_token = async (API, Contract_Merkle_Minter, metadata, VERBOSE=true) => {

  // Contract Initialization ---------------------------------------------------

  // User Address
  const userAddress = await API.wallet().address()
  const paymentCredentialHash = paymentCredentialOf(userAddress).hash;

  // Policy IDs
  const policyId_Merkle_Minter = Contract_Merkle_Minter.script.hash
  
  // Acount Token
  let accountHashed = blake2b(32).update(fromHex( Data.to(new Constr(0, [paymentCredentialHash])) )).digest('hex')
  const asset_token_account = `${policyId_Merkle_Minter}${accountHashed}`
  const quantity_token_account = 1
  if (VERBOSE) {
    console.log(`${colors.cyan}Account Token${colors.reset}:`);
    const output = {
      name: accountHashed,
      policy: policyId_Merkle_Minter,
      asset: asset_token_account,
      quantity: quantity_token_account
    };
    
    // Format each property with color
    Object.entries(output).forEach(([key, value]) => {
      console.log(`${colors.magenta}${key}${colors.reset}: ${value}`);
    });
  }

  // Parameterizing Contract ---------------------------------------------------
  if (VERBOSE) {
    console.log(`${colors.cyan}INFO${colors.reset}: Parameterizing Metadata Minting Contract`);
  }

  let validate_match_true = new Constr(0, [])
  let validate_match_false = new Constr(1, [])
  const Script_Parameterized_Metadata = {
    type: "PlutusV3",
    script: applyParamsToScript(
      Validator_Metadata_Minter.cborHex,
      // [policyId_Merkle_Minter, true]
      [policyId_Merkle_Minter, validate_match_true]
    ),
  };
  const Address_Contract_Metadata_Minter = validatorToAddress(await API.config().network, Script_Parameterized_Metadata);
  const policyId_Metadata_Minter = validatorToScriptHash(Script_Parameterized_Metadata)

  // Contract Addresses
  const Address_Contract_Merkle_Minter = Contract_Merkle_Minter.script.address;

  // Get Relevant TX UTXO References -------------------------------------------
  if (VERBOSE) {
    console.log(`${colors.cyan}INFO${colors.reset}: Querying UTXO inputs`);
  } 
  const scriptUtxos = await API.utxosAt(Address_Contract_Merkle_Minter)
  const accountUtxos = scriptUtxos.filter((object) => {
    return Object.keys(object.assets).includes(asset_token_account);
  });
  if (!accountUtxos[0]) {
    console.log(colors.red + "ERROR" + colors.reset+":" + ` Root Asset ${asset_token_account} not found at Contract Address: ${Address_Contract_Merkle_Minter}`);
    return
  }
  const account_token_index = accountUtxos[0].outputIndex

  const input_ref = new Constr(0, [
    accountUtxos[0].txHash,
    BigInt(account_token_index),
  ]);
  if (VERBOSE) {
    console.log(colors.magenta + "Account Asset UTXO (Script)" + colors.reset+":");
    console.dir(accountUtxos, { depth: null });
  }

  // Configure Script Datum --------------------------------------------------
  if (VERBOSE) { console.log(`${colors.cyan}INFO${colors.reset}: Configuring Datum`); }
  // Increment datum
  var incrementedAccountDatum = Data.from(accountUtxos[0].datum)
  incrementedAccountDatum.fields[1] = incrementedAccountDatum.fields[1] + 1n;
  incrementedAccountDatum = Data.to(incrementedAccountDatum)

  // Build the First TX for script data hash ---------------------------------
  if (VERBOSE) { console.log(`${colors.cyan}INFO${colors.reset}: Building pseudo transaction`); }
  const script_data_hash = await buildPseudoTX(API, metadata, incrementedAccountDatum)

  // Define Token Information -----------------------------------------------
  if (VERBOSE) { console.log(`${colors.cyan}INFO${colors.reset}: Defining Asset from Script Data Hash of Pseudo TX`); }

  // Asset
  const quantity_token = 1 
  const asset_token = `${policyId_Metadata_Minter}${''}`

  // Metadata
  const metadata_obj = Data.fromJson(metadata)
  const metadata_bytes = Data.to(metadata_obj)
  const metadata_hash = fromText(
    blake2b(32).update(Buffer.from(Data.to(metadata_obj))).digest('hex')
  )

  // Log Token Info to Console
  if (VERBOSE) {
    console.log(`${colors.cyan}Minting Token${colors.reset}:`);
    const output = {
      name: script_data_hash,
      policy: policyId_Metadata_Minter,
      asset: asset_token,
      quantity: quantity_token,
      metadata_hash: metadata_hash
    };
    
    // Format each property with color
    Object.entries(output).forEach(([key, value]) => {
      console.log(`${colors.magenta}${key}${colors.reset}: ${value}`);
    });

    console.log(colors.yellow + "Token Metadata" + colors.reset+":");
    console.dir(metadata, { depth: null });
  }

  // Set up redeemer components ---------------------------------------------
  
  // 3. Handle collateral
  const userUtxos = await API.utxosAt(userAddress);
  const collateralUtxos = userUtxos.filter(utxo => {
    return Object.keys(utxo.assets).length === 1 && 
           utxo.assets.lovelace >= 5000000n;
  });
  
  if (!collateralUtxos.length) {
    throw new Error("No suitable collateral UTXOs found. Need UTXOs with only ADA and at least 5 ADA");
  }
  
  const collateralInput = collateralUtxos[0];

  // Create TransactionBodyPieces following Aiken type
  const tx_body = new Constr(0, [
    metadata_hash,
    metadata_hash,
    metadata_hash,
    metadata_hash,                        // metadata_hash: ByteArray
    // fromText(Data.to(convertInputToCbor(collateralInput))),  // collateral_inputs (direct Constr, not serialized text)
    // new Constr(0, [                       // collateral_output (direct Constr, not serialized text)
    //   fromText(userAddress),
    //   formatValue({ lovelace: BigInt(collateralInput.assets.lovelace - 5000000n) }),
    //   new Constr(0, [])
    // ]),
    // fromText(Data.to(BigInt(5000000)))                      // collateral_fee (BigInt, not serialized text)
  ]);

  // Construct final MintToken redeemer
  const mintRedeemer = Data.to(
    new Constr(0, [     // MintToken constructor
      input_ref,        // OutputReference
      tx_body,          // TransactionBodyPieces
      metadata_bytes    // Metadata (ByteArray)
    ])
  );
  const spendRedeemer = Data.to(
    new Constr(1, [BigInt(0n)])
  ); 

  if (VERBOSE) {
    console.log(`${colors.cyan}Redeemer Parameters${colors.reset}:`);
    const output = {
      'input_ref':  input_ref,
      'tx_body': tx_body,
      'metadata': metadata_bytes
    };
    // Format each property with color
    Object.entries(output).forEach(([key, value]) => {
      console.log(`${colors.magenta}${key}${colors.reset}: ${value}`);
    });
  }

  // Build the Final TX -----------------------------------------------------
  if (VERBOSE) {console.log(`${colors.cyan}INFO${colors.reset}: Building the Secondary (actual) TX`);}
  if (VERBOSE) {
    console.log(`${colors.cyan}Final TX Body${colors.reset}:`);
    console.dir(Data.from(Data.to(tx_body)), { depth: null });
    console.log(`${colors.cyan}Final Metadata${colors.reset}:`);
    console.dir(Data.from(metadata_bytes), { depth: null });
  }
  const tx = await API.newTx()
    .collectFrom(accountUtxos, spendRedeemer)
    .pay.ToContract(
      accountUtxos[0].address, 
      { kind: "inline", value: incrementedAccountDatum },
      accountUtxos[0].assets,
    ) 
    .mintAssets(
      {[asset_token]: BigInt(quantity_token)},  mintRedeemer
    )
    .pay.ToAddress(
      userAddress, 
      {[asset_token]: BigInt(quantity_token)},
    ) 
    // .attachMetadata(721n, metadata)
    // .selectCollateral([collateralInput])
    .attach.MintingPolicy(Script_Parameterized_Metadata)
    .attach.SpendingValidator(Contract_Merkle_Minter.script.Validator)
    .addSigner(userAddress)
    .complete();

  // if (VERBOSE) { console.log(`${colors.cyan}Raw TX${colors.reset}: ${tx.toString()}`);}

  // Sign and Submit ------------------------------------------------------
  if (VERBOSE) { console.log(`${colors.cyan}INFO${colors.reset}: Requesting TX signature`);}
  const signedTx = await tx.sign.withWallet().complete();

  // Submit the TX -----------------------------------------------------------
  if (VERBOSE) {console.log(`${colors.cyan}INFO${colors.reset}: Attempting to submit the transaction`);}
  const txHash = await signedTx.submit();

  // Return with TX hash -----------------------------------------------------
  console.log(`${colors.magenta}TX Hash${colors.reset}: ${txHash}`);

  return {
    tx_id: txHash,
    address: Address_Contract_Metadata_Minter,
    policy_id: policyId_Metadata_Minter,
  };
}