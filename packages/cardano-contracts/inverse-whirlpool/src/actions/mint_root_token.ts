
import metadata from "./../data/metadata.json" assert { type: "json" };
import Validator_Metadata_Minter from "../scripts/paima.json" assert { type: "json" };
// import Validator_Always_True from "../scripts/true.json" assert { type: "json" };
import { buildPseudoTX } from './index.ts';
import blake2b from 'blake2b';
import {
  paymentCredentialOf,
  Constr,
  Data,
  applyParamsToScript,
  validatorToScriptHash,
  validatorToAddress,
  scriptFromNative
} from "@lucid-evolution/lucid";
import fs from 'fs';

// #############################################################################
// ## MINT TOKEN
// #############################################################################
export const mint_root_token = async (API, Contract_Merkle_Minter, VERBOSE=true) => {

  // Contract Initialization ---------------------------------------------------
  if (VERBOSE) { console.log("INFO: Parameterizing Contracts"); }

  // User Address
  const userAddress = await API.wallet().address()
  const paymentCredentialHash = paymentCredentialOf(userAddress).hash;

  // Mint Validators
  // const Validator_AlwaysTrue = scriptFromNative({
  //   type: "all",
  //   scripts: [{ type: "sig", keyHash: paymentCredentialHash }]
  // });

  // const Script_AlwaysTrue     = JSON.parse(JSON.stringify(Validator_Always_True))

  // Policy IDs
  const policyId_Merkle_Minter   = Contract_Merkle_Minter.script.hash

  const Script_Parameterized_Metadata = {
    type: "PlutusV3",
    script: applyParamsToScript(
      Validator_Metadata_Minter.cborHex ,
      [ policyId_Merkle_Minter, Data.to(true, Data.Boolean()) ]
    ),
  };
  const Address_Contract_Metadata_Minter = validatorToAddress("Preview", Script_Parameterized_Metadata);
  const policyId_Metadata_Minter = validatorToScriptHash(Script_Parameterized_Metadata)

  // Contract Addresses
  const Address_Contract_Merkle_Minter   = Contract_Merkle_Minter.script.address; // Parameterized

  
  if (VERBOSE) { 
    console.log({
      "Contract Address - Merkle-Minter:": Address_Contract_Merkle_Minter,
      "Contract Address - Metadata-Minter:": Address_Contract_Metadata_Minter,
      "Policy ID - Merkle-Minter:": policyId_Merkle_Minter,
      "Policy ID - Metadata-Minter:": policyId_Metadata_Minter,
    })
  }

  // Configure Script Datum and Redeemer ----------------------------------------
  if (VERBOSE) { console.log("INFO: Configuring Datum"); }

  // Mint Action: AlwaysTrue (ref: validation.ak)
  const mintRedeemer1 = Data.to(
    new Constr(0, [])
  );
  const scriptDatumStructure = Data.Object({
    credential: Data.Bytes(),
    amnt: Data.Integer(),
  })
  const scriptDatum = Data.to({
    credential: paymentCredentialHash, 
    amnt: BigInt(1)
  }, scriptDatumStructure)

  if (VERBOSE) { 
    console.log('Pseudo Transaction:', {
      "Script Datum": scriptDatum,
      "Redeemer": mintRedeemer1,
    })
  }

  // Build the First TX --------------------------------------------------------
  // build a tx just to be able to compute what the script data hash will be
  if (VERBOSE) { console.log("INFO: Building psuedo transaction") };
  const script_data_hash = await buildPseudoTX(API, metadata, scriptDatum)

  // Define Primary Token Information ------------------------------------------
  if (VERBOSE) { console.log("INFO: Defining Asset from Script Data Hash of Pseudo TX") };

  // Token 2 - Token with scriptDataHash as the asset name
  const quantity_token = 1 
  const asset_token = `${policyId_Metadata_Minter}${(script_data_hash)}`

  if (VERBOSE) { 
    console.log('Minting Token:', {
      "Asset": asset_token,
      "Quantity": quantity_token,
    })
  }

  // Set up redeemer
  const utxos_contract = await API.utxosAt(Address_Contract_Merkle_Minter)
  // const utxos_base_asset = utxos_user.filter((object) => {
  //   return Object.keys(object.assets).includes(asset_baseToken);
  // });
  //console.log('INFO: UTXOs to select from:',utxos_user)
  const utxo = utxos_contract[0];
  const outputReference = {
    txHash: utxo.txHash,
    outputIndex: utxo.outputIndex,
  };

  if (VERBOSE) { console.log("UTXO Reference:", outputReference) };
  const input_ref = new Constr(0, [
    new Constr(0, [outputReference.txHash]),
    BigInt(outputReference.outputIndex),
  ]);

  const metadata_obj = Data.fromJson(metadata)
  if (VERBOSE) { console.log("Metadata:", metadata) };
  if (VERBOSE) { console.log("Metadata:", metadata_obj) };  
  const metadata_bytes = Data.to(metadata_obj)
  let metadata_hash = blake2b(32).update( Buffer.from(Data.to(metadata_obj))).digest('hex')
  console.log('Metadata hash:', metadata_hash)

  const collateral_inputs = ""
  const collateral_output = ""
  const collateral_fee = ""

  const tx_body =  new Constr(0, [metadata_hash, collateral_inputs, collateral_output, collateral_fee])

  const mintRedeemer2 = Data.to(
    new Constr(0, [input_ref, tx_body, metadata_bytes])
  );

  if (VERBOSE) { console.log("INFO: scriptDataHash (to be used as assetName):", script_data_hash); }

  // Build the Second TX -------------------------------------------------------
  if (VERBOSE) { console.log("INFO: Building the Secondary TX"); }
  const tx = await API.newTx()
    .pay.ToAddressWithData(
      Address_Contract_Metadata_Minter, 
      { kind: "inline", value: scriptDatum },
      {},
    ) 
    .pay.ToAddress(
      userAddress, 
      {[asset_token]: BigInt(quantity_token)},
    ) 
    .mintAssets({[asset_token]: BigInt(quantity_token)}, mintRedeemer2)
    .attach.MintingPolicy(Script_Parameterized_Metadata)
    .attachMetadata(721n, metadata)
    .addSigner(userAddress)
    .complete({localUPLCEval: false});
  if (VERBOSE) { console.log("INFO: Raw TX", tx.toString()); }

  // Request User Signature ----------------------------------------------------
  console.log("INFO: Requesting TX signature");
  const signedTx = await tx.sign().complete();

  // Submit the TX -------------------------------------------------------------
  console.log("INFO: Attempting to submit the transaction");
  const txHash = await signedTx.submit();

  // Return with TX hash -------------------------------------------------------
  return {
    tx_id: txHash,
    address: Address_Contract_Metadata_Minter,
    policy_id: policyId_Metadata_Minter,
  };
}
