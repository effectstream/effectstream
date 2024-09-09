import metadata from "./metadata.json" assert {type: 'json'};
import { HotWallet, Core, Blaze, U5C, makeValue, Data} from "@blaze-cardano/sdk";
import {buildPseudoTX} from "./util.js";
import * as plutus from './plutus.ts';
import fs from 'fs';
import { Store, Trie } from '@aiken-lang/merkle-patricia-forestry';
//import blake2b from 'blake2b';
import { Encoder, decode } from 'cbor-x';
import { AssetId, AssetName, NetworkId, PolicyId } from "@blaze-cardano/core";

const VERBOSE = true;

// #############################################################################
// ## MINT MERKLE INIT
// #############################################################################
export const init_merkle = async (API: Blaze<U5C, HotWallet>) => {

  //API

  // Contract Initialization ---------------------------------------------------
  if (VERBOSE) { console.log("INFO: Parameterizing Contracts"); }

  // User Address
  const userAddress = API.wallet.address

  // Get the User's UTXOs ------------------------------------------------------
  const utxos_user = await API.wallet.getUnspentOutputs();
  const utxo = utxos_user[0];

  // Transfer Token Contract - Mint Receipt Redeemer
  // const paramScript_Merkle_Minter = new plutus.WhirlMerkleMint({
  //   transactionId: utxo.input().transactionId(), outputIndex: utxo.input().index()
  // })
  const paramScript_Merkle_Minter = new plutus.TrueAlways()
  fs.writeFileSync('data/param_script.json', JSON.stringify({'validator': paramScript_Merkle_Minter.toCbor()}), { encoding: 'utf-8' });

  // Contract Addresses

  const address = Core.addressFromValidator(NetworkId.Testnet, paramScript_Merkle_Minter)

  const policyId_Merkle_Minter = paramScript_Merkle_Minter.hash()
  
  // Define Sacrificial Token Information --------------------------------------
  if (VERBOSE) { console.log("INFO: Defining Sacrificial and Primary Asset") };

  // Configure Script Datum and Redeemer ----------------------------------------
  if (VERBOSE) { console.log("INFO: Configuring Datum"); }

  // Mint Action: InitMerkle (ref: validation.ak)
  const mintRedeemer = Data.to('InitMerkle', plutus.WhirlMerkleMint.rdmr); 
  // const scriptDatum = Data.to({
  //   Merkle: {
  //     root: "0000000000000000000000000000000000000000000000000000000000000000", 
  //     ownHash: policyId_Merkle_Minter
  //   }}, plutus.WhirlMerkleSpend.datum)

    const scriptDatum = Data.to('',)
  

  // Token 2 - Token with scriptDataHash as the asset name
  const quantity_token = 1 
  const asset_token = `${policyId_Merkle_Minter}${""}`

  // Build the Second TX -------------------------------------------------------
  if (VERBOSE) { console.log("INFO: Building the TX"); }

  const tx = await API.newTransaction().useEvaluator((x,y)=>API.provider.evaluateTransaction(x,y))
  .lockAssets(address,
    makeValue(0n, [asset_token, 1n]),
    scriptDatum
  )
  .addMint(
    PolicyId(policyId_Merkle_Minter),
    new Map([[AssetName(''), 1n]]),
    mintRedeemer
  )
  .provideScript(paramScript_Merkle_Minter)
  .addInput(utxo)
  .complete();

  
  // if (VERBOSE) { console.log("INFO: Raw TX", tx.toString()); }

  // Request User Signature ----------------------------------------------------
  console.log("INFO: Requesting TX signature");
  const signedTx = await API.signTransaction(tx);

  // Submit the TX -------------------------------------------------------------
  console.log("INFO: Attempting to submit the transaction");
  const txHash = await API.submitTransaction(tx);

  if (!txHash) {
    console.log("There was a change to the script's metadata")
  }
   else {
    console.log(`TX Hash Submitted: ${txHash}`);
  }

  // Return with TX hash -------------------------------------------------------
  return {
    tx_id: txHash,
    address,
    policy_id: policyId_Merkle_Minter,
  };
}


// // #############################################################################
// // ## MINT MERKLE INIT
// // #############################################################################
// export const create_account = async (API, Validator_Merkle_Minter) => {

//   // Contract Initialization ---------------------------------------------------
//   if (VERBOSE) { console.log("INFO: Parameterizing Contracts"); }

//   // User Address
//   const userAddress = await API.wallet.address()
//   if (VERBOSE) { 
//     console.log({
//       "User Address": userAddress,
//       "Network": API.network
//     })
//   }
//   const paymentCredentialHash = paymentCredentialOf(userAddress).hash

//   // Contract Addresses
//   const Address_Contract_Merkle_Minter = API.utils.validatorToAddress(Validator_Merkle_Minter);

//   // Policy IDs
//   const policyId_Merkle_Minter = API.utils.validatorToScriptHash(Validator_Merkle_Minter)
  

//   // Configure Script Datum and Redeemer ----------------------------------------
//   if (VERBOSE) { console.log("INFO: Configuring Datum"); }

//   const asset_token_root = `${policyId_Merkle_Minter}${""}`
//   const quantity_token_root = 1

//   const scriptUtxos = await API.utxosAt(Address_Contract_Merkle_Minter)
//   const assetCollateralTokenUTXO = scriptUtxos.filter((object) => {
//     return Object.keys(object.assets).includes(asset_token_root);
//   });
//   console.log("Contract Token in at UTXO:", assetCollateralTokenUTXO)
//   console.log("Output index:", assetCollateralTokenUTXO[0].outputIndex)

//   // Mint Action: CreateAccount (ref: validation.ak)

//   const output_index =  BigInt(assetCollateralTokenUTXO[0].outputIndex)
  
//   console.log('pkh', paymentCredentialHash)
//   const account = Data.to(
//   new Constr(1, 
//     [
//       new Constr(0, [paymentCredentialHash]), BigInt(1)
//     ]
//   ))

//   let accountSerialized =  Data.to(new Constr(0, [paymentCredentialHash]))
//   let accountHashed = blake2b(32).update(fromHex(accountSerialized)).digest('hex')
  
//   console.log('Serialized Account:', accountSerialized)
//   console.log('Blake2b Account Hash:', accountHashed)

//   let merkle_tree = await new Trie(new Store('data/merkle_forest_db'));
//   await merkle_tree.insert(accountHashed, accountHashed);
//   //merkle_tree = await merkle_tree.insert("abc", "def");
//   // await merkle_tree.save()
//   console.log('Merkle Tree:', merkle_tree)

//   const merkle_tree_hash = await merkle_tree.hash;
// //  const merkle_tree_proof = await merkle_tree.prove(Buffer.from(accountHashed))
//   const merkle_tree_proof = await merkle_tree.prove(accountHashed)
//   const merkle_tree_proof_hex = await merkle_tree_proof.toCBOR().toString('hex');

//   console.log('merkle_tree_proof_hex', merkle_tree_proof_hex)
//   console.log('Merkle Tree Info:',
//   {
//   'merkle_proof_hash': toHex(merkle_tree_hash),
//   })
//   console.log('Redeemer Parameters:', {
//     'account' : paymentCredentialHash,
//     'merkle_tree_proof': merkle_tree_proof_hex,
//     'output_index': output_index
//   })

//   const mintRedeemer = Data.to(
//     new Constr(1, [new Constr(0, [paymentCredentialHash]), Data.from(merkle_tree_proof_hex), output_index])
//   ); 
//   const spendRedeemer = Data.to(
//     new Constr(1, [new Constr(0, [])])
//   ); 
//   console.log('Mint Redeemer:', mintRedeemer)
//   console.log('Spend Redeemer:', spendRedeemer)


//   // const scriptDatum_Mint = Data.to(
//   //   new Constr(0, [toHex(merkle_tree_hash), policyId_Merkle_Minter])
//   // ); 
//   const scriptDatum_SpendRoot = Data.to(
//     new Constr(0, [toHex(merkle_tree_hash), policyId_Merkle_Minter])
//   ); 
//   /* REF: 
//     pub type State {
//       Merkle { root: RootHash, own_hash: PolicyId }
//       Account(Credential, Int)
//     }
//   */

//   const asset_token_account = `${policyId_Merkle_Minter}${accountHashed}`
//   const quantity_token_account = 1

//   // Build the Second TX -------------------------------------------------------
//   if (VERBOSE) { console.log("INFO: Building the TX"); }
//   const tx = await API.newTx()
//     .payToContract(
//       Address_Contract_Merkle_Minter, 
//       {inline: scriptDatum_SpendRoot},
//       {[asset_token_root]: BigInt(quantity_token_root)},
//     )
//     .payToContract(
//       Address_Contract_Merkle_Minter, 
//       {inline: account},
//       {[asset_token_account]: BigInt(quantity_token_account)},
//     )
//     .mintAssets({[asset_token_account]: BigInt(quantity_token_account)}, mintRedeemer)
//     .attachMintingPolicy(Validator_Merkle_Minter)
//     .collectFrom(assetCollateralTokenUTXO, spendRedeemer)
//     .attachSpendingValidator(Validator_Merkle_Minter)
//     .addSigner(userAddress)
//     .complete();
//   if (VERBOSE) { console.log("INFO: Raw TX", tx.toString()); }

//   // Request User Signature ----------------------------------------------------
//   console.log("INFO: Requesting TX signature");
//   const signedTx = await tx.sign().complete();

//   // Submit the TX -------------------------------------------------------------
//   console.log("INFO: Attempting to submit the transaction");
//   const txHash = await signedTx.submit();

//   if (!txHash) {
//     console.log("There was a change to the script's metadata")
//   }
//    else {
//     console.log(`TX Hash Submitted: ${txHash}`);
//     const txSuccess = await lucid.awaitTx(txHash)
//     if (txSuccess) {
//       console.log(`TX Settled on Chain`);
//     }
//   }

//   // Return with TX hash -------------------------------------------------------
//   return {
//     tx_id: txHash,
//     address: Address_Contract_Merkle_Minter,
//     policy_id: policyId_Merkle_Minter,
//   };
// }

// // #############################################################################
// // ## MINT TOKEN
// // #############################################################################
// export const mint_token = async (API, Validators, Validator_Merkle_Minter) => {

//   // Contract Initialization ---------------------------------------------------
//   if (VERBOSE) { console.log("INFO: Parameterizing Contracts"); }

//   // User Address
//   const userAddress = await API.wallet.address()
//   if (VERBOSE) { 
//     console.log({
//       "User Address": userAddress,
//       "Network": API.network
//     })
//   }

//   // Mint Validators
//   const Validator_AlwaysTrue = {type: "PlutusV2", script: Validators.AlwaysTrue.script };
//   const Validator_Metadata_Minter = {type: "PlutusV2", script: Validators.Metadata_Minter.script };

//   // Contract Addresses
//   const Address_Contract_Merkle_Minter = API.utils.validatorToAddress(Validator_Merkle_Minter);
//   const Address_Contract_Metadata_Minter = API.utils.validatorToAddress(Validator_Metadata_Minter);

//   // Policy IDs
//   const policyId_Always_True = API.utils.validatorToScriptHash(Validator_AlwaysTrue)
//   const policyId_Merkle_Minter = API.utils.validatorToScriptHash(Validator_Merkle_Minter)
//   const policyId_Metadata_Minter = API.utils.validatorToScriptHash(Validator_Metadata_Minter)
  
//   if (VERBOSE) { 
//     console.log({
//       "Contract Address - Merkle-Minter:": Address_Contract_Merkle_Minter,
//       "Contract Address - Metadata-Minter:": Address_Contract_Metadata_Minter,
//       "Policy ID - Always True:": policyId_Always_True,
//       "Policy ID - Merkle-Minter:": policyId_Merkle_Minter,
//       "Policy ID - Metadata-Minter:": policyId_Metadata_Minter,
//     })
//   }

//   // Configure Script Datum and Redeemer ----------------------------------------
//   if (VERBOSE) { console.log("INFO: Configuring Datum"); }

//   // Mint Action: AlwaysTrue (ref: validation.ak)
//   const mintRedeemer1 = Data.to(
//     new Constr(0, [])
//   );
//   const scriptDatumStructure = Data.Object({
//     credential: Data.Bytes,
//     amnt: Data.Integer(),
//   })
//   const scriptDatum = Data.to({credential: BigInt(1), amnt: BigInt(1)}, scriptDatumStructure)

//   if (VERBOSE) { 
//     console.log('Pseudo Transaction:', {
//       "Script Datum": scriptDatum,
//       "Redeemer": mintRedeemer1,
//     })
//   }

//   // Build the First TX --------------------------------------------------------
//   // build a tx just to be able to compute what the script data hash will be
//   if (VERBOSE) { console.log("INFO: Building psuedo transaction") };
//   const script_data_hash = await buildPseudoTX(API, Validator_AlwaysTrue, metadata, scriptDatum)

//   // Define Primary Token Information ------------------------------------------
//   if (VERBOSE) { console.log("INFO: Defining Asset from Script Data Hash of Pseudo TX") };

//   // Token 2 - Token with scriptDataHash as the asset name
//   const quantity_token = 1 
//   const asset_token = `${policyId_Metadata_Minter}${(script_data_hash)}`

//   if (VERBOSE) { 
//     console.log('Minting Token:', {
//       "Asset": asset_token,
//       "Quantity": quantity_token,
//     })
//   }

//   // Set up redeemer
//   const utxos_contract = await API.utxosAt(Address_Contract_Merkle_Minter)
//   // const utxos_base_asset = utxos_user.filter((object) => {
//   //   return Object.keys(object.assets).includes(asset_baseToken);
//   // });
//   //console.log('INFO: UTXOs to select from:',utxos_user)
//   const utxo = utxos_contract[0];
//   const outputReference = {
//     txHash: utxo.txHash,
//     outputIndex: utxo.outputIndex,
//   };

//   if (VERBOSE) { console.log("UTXO Reference:", outputReference) };
//   const input_ref = new Constr(0, [
//     new Constr(0, [outputReference.txHash]),
//     BigInt(outputReference.outputIndex),
//   ]);

//   const metadata_obj = Data.fromJson(metadata)
//   if (VERBOSE) { console.log("Metadata:", metadata) };
//   if (VERBOSE) { console.log("Metadata:", metadata_obj) };
//   //const metadata_string = JSON.parse(metadata)
//   //if (VERBOSE) { console.log("Metadata:", metadata.toString().getBytes("UTF-8")) };
  
// //const ListingSchema = Data.Object();
//   console.log('Metadata bytes:', Buffer.from(metadata_obj))
//   if (VERBOSE) { console.log("Metadata:", Data.castTo(metadata_obj, Data.Bytes)) };
//   let metadata_hash = blake2b(32).update(Buffer.from(metadata_obj)).digest('hex')
//   console.log('Metadata hash:', metadata_hash)
//   const tx_body =  new Constr(0, [metadata_hash, collateral_inputs, collateral_output, collateral_fee])

//   const mintRedeemer2 = Data.to(
//     new Constr(0, [input_ref, tx_body, metadata_bytes])
//   );

//   if (VERBOSE) { console.log("INFO: scriptDataHash (to be used as assetName):", script_data_hash); }

//   // Build the Second TX -------------------------------------------------------
//   if (VERBOSE) { console.log("INFO: Building the Secondary TX"); }
//   const tx = await API.newTx()
//     .payToAddressWithData(
//       Address_Contract_Metadata_Minter, 
//       {inline: scriptDatum},
//       {},
//     ) 
//     .payToAddress(
//       userAddress, 
//       {[asset_token]: BigInt(quantity_token)},
//     ) 
//     .mintAssets({[asset_token]: BigInt(quantity_token)}, mintRedeemer2)
//     .attachMintingPolicy(Validator_Metadata_Minter)
//     .attachMetadata(721n, metadata)
//     .addSigner(userAddress)
//     .complete();
//   if (VERBOSE) { console.log("INFO: Raw TX", tx.toString()); }

//   // Request User Signature ----------------------------------------------------
//   console.log("INFO: Requesting TX signature");
//   const signedTx = await tx.sign().complete();

//   // Submit the TX -------------------------------------------------------------
//   console.log("INFO: Attempting to submit the transaction");
//   const txHash = await signedTx.submit();

//   if (!txHash) {
//     console.log("There was a change to the script's metadata")
//   }
//    else {
//     console.log(`TX Hash Submitted: ${txHash}`);
//     const txSuccess = await lucid.awaitTx(txHash)
//     if (txSuccess) {
//       console.log(`TX Settled on Chain`);
//     }

//   }

//   // Return with TX hash -------------------------------------------------------
//   return {
//     tx_id: txHash,
//     address: Address_Contract_Metadata_Minter,
//     policy_id: policyId_Metadata_Minter,
//   };
// }

// // #############################################################################
// // ## Burn TOKEN
// // #############################################################################
// export const burn_token = async (API) => {

//   // Contract Initialization ---------------------------------------------------
//   if (VERBOSE) { console.log("INFO: Parameterizing Contracts"); }

//   // User Address
//   const userAddress = await API.wallet.address()
//   if (VERBOSE) { 
//     console.log({
//       "User Address": userAddress,
//       "Network": API.network
//     })
//   }

//   // Mint Validators
//   const Validator_AlwaysTrue = {type: "PlutusV2", script: Validators.AlwaysTrue.script };
//   const Validator_Metadata_Minter = {type: "PlutusV2", script: Validators.Metadata_Minter.script };

//   // Contract Addresses
//   const Address_Contract_Metadata_Minter = API.utils.validatorToAddress(Validator_Metadata_Minter);

//   // Policy IDs
//   const policyId_Metadata_Minter = API.utils.validatorToScriptHash(Validator_Metadata_Minter)
  
//   // Define Sacrificial Token Information --------------------------------------
//   if (VERBOSE) { console.log("INFO: Defining Sacrificial and Primary Asset") };

//   // Configure Script Datum and Redeemer ----------------------------------------
//   if (VERBOSE) { console.log("INFO: Configuring Datum"); }

//   // Mint Action: BurnAccount (ref: validation.ak)
//   const mintRedeemer = Data.to(
//     new Constr(1, [])
//   ); 

//   const scriptDatumStructure = Data.Object({
//     credential: Data.Bytes,
//     amnt: Data.Integer(),
//   })
//   const scriptDatum = Data.to({credential: BigInt(1), amnt: BigInt(1)}, scriptDatumStructure)

//   // Build the First TX --------------------------------------------------------
//   // build a tx just to be able to compute what the script data hash will be
//   const script_data_hash = await buildPseudoTX(API, Validator_AlwaysTrue, metadata, scriptDatum)

//   // Define Primary Token Information ------------------------------------------
//   if (VERBOSE) { console.log("INFO: Defining Sacrificial and Primary Asset") };

//   // Token 2 - Token with scriptDataHash as the asset name
//   const quantity_token = 1 
//   const asset_token = `${policyId_Metadata_Minter}${(script_data_hash)}`
  
//   if (VERBOSE) { console.log("INFO: scriptDataHash (to be used as assetName):", script_data_hash); }

//   // Build the Second TX -------------------------------------------------------
//   if (VERBOSE) { console.log("INFO: Building the Secondary TX"); }
//   const tx = await API.newTx()
//     .mintAssets({[asset_token]: BigInt(-quantity_token)}, mintRedeemer)
//     .attachMintingPolicy(Validator_Metadata_Minter)
//     .addSigner(userAddress)
//     .complete();
//   if (VERBOSE) { console.log("INFO: Raw TX", tx.toString()); }

//   // Request User Signature ----------------------------------------------------
//   console.log("INFO: Requesting TX signature");
//   const signedTx = await tx.sign().complete();

//   // Submit the TX -------------------------------------------------------------
//   console.log("INFO: Attempting to submit the transaction");
//   const txHash = await signedTx.submit();

//   if (!txHash) {
//     console.log("There was an error submitted the TX")
//   }
//    else {
//     console.log(`TX Hash Submitted: ${txHash}`);
//     const txSuccess = await lucid.awaitTx(txHash)
//     if (txSuccess) {
//       console.log(`TX Settled on Chain`);
//     }
//   }

//   // Return with TX hash -------------------------------------------------------
//   return {
//     tx_id: txHash,
//     address: Address_Contract_Metadata_Minter,
//     policy_id: policyId_Metadata_Minter,
//   };

// }

// // #############################################################################
// // ## Update TOKEN
// // #############################################################################
// export const update_token = async (API) => {

//   // Contract Initialization ---------------------------------------------------
//   if (VERBOSE) { console.log("INFO: Parameterizing Contracts"); }

//   // User Address
//   const userAddress = await API.wallet.address()
//   if (VERBOSE) { 
//     console.log({
//       "User Address": userAddress,
//       "Network": API.network
//     })
//   }

//   // Mint Validators
//   const Validator_AlwaysTrue = {type: "PlutusV2", script: Validators.AlwaysTrue.script };
//   const Validator_Merkle_Minter = {type: "PlutusV2", script: Validators.Merkle_Minter.script };

//   // Contract Addresses
//   const Address_Contract_Merkle_Minter = API.utils.validatorToAddress(Validator_Merkle_Minter);

//   // Policy IDs
//   const policyId_Merkle_Minter = API.utils.validatorToScriptHash(Validator_Merkle_Minter)
  
//   // Define Sacrificial Token Information --------------------------------------
//   if (VERBOSE) { console.log("INFO: Defining Sacrificial and Primary Asset") };

//   // Configure Script Datum and Redeemer ----------------------------------------
//   if (VERBOSE) { console.log("INFO: Configuring Datum"); }

//   // Mint Action: InitMerkle (ref: validation.ak)
//   const mintRedeemer = Data.to(
//     new Constr(0, [])
//   ); 
//   const scriptDatumStructure = Data.Object({
//     credential: Data.Bytes,
//     amnt: Data.Integer(),
//   })
//   const scriptDatum = Data.to({credential: BigInt(1), amnt: BigInt(1)}, scriptDatumStructure)

//   // Build the First TX --------------------------------------------------------
//   // build a tx just to be able to compute what the script data hash will be
//   const script_data_hash = await buildPseudoTX(API, Validator_AlwaysTrue, metadata, scriptDatum)

//   // Define Primary Token Information ------------------------------------------
//   if (VERBOSE) { console.log("INFO: Defining Sacrificial and Primary Asset") };

//   // Token 2 - Token with scriptDataHash as the asset name
//   const quantity_token = 1 
//   const asset_token = `${policyId_Merkle_Minter}${(script_data_hash)}`
  
//   if (VERBOSE) { console.log("INFO: scriptDataHash (to be used as assetName):", script_data_hash); }

//   // Build the Second TX -------------------------------------------------------
//   if (VERBOSE) { console.log("INFO: Building the Secondary TX"); }
//   const tx = await API.newTx()
//     .payToAddressWithData(
//       Address_Contract_Merkle_Minter, 
//       {inline: scriptDatum},
//       {},
//     ) 
//     .payToAddress(
//       userAddress, 
//       {[asset_token]: BigInt(quantity_token)},
//     ) 
//     .mintAssets({[asset_token]: BigInt(quantity_token)}, mintRedeemer)
//     .attachMintingPolicy(Validator_Merkle_Minter)
//     .attachMetadata(721n, metadata)
//     .addSigner(userAddress)
//     .complete();
//   if (VERBOSE) { console.log("INFO: Raw TX", tx.toString()); }

//   // Request User Signature ----------------------------------------------------
//   console.log("INFO: Requesting TX signature");
//   const signedTx = await tx.sign().complete();

//   // Submit the TX -------------------------------------------------------------
//   console.log("INFO: Attempting to submit the transaction");
//   const txHash = await signedTx.submit();

//   if (!txHash) {
//     console.log("There was a change to the script's metadata")
//   }
//    else {
//     console.log(`TX Hash Submitted: ${txHash}`);
//     const txSuccess = await lucid.awaitTx(txHash)
//     if (txSuccess) {
//       console.log(`TX Settled on Chain`);
//     }
//   }

//   // Return with TX hash -------------------------------------------------------
//   return {
//     tx_id: txHash,
//     address: Address_Contract_Merkle_Minter,
//     policy_id: policyId_Merkle_Minter,
//   };
// }