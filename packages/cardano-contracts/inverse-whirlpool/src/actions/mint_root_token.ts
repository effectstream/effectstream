import metadata from "./../data/metadata.json" assert { type: "json" };
import Validator_Metadata_Minter from "../scripts/paima.json" assert { type: "json" };
import { buildPseudoTX } from './index.ts';
import blake2b from 'blake2b';
import {
  paymentCredentialOf,
  Constr,
  Data,
  fromText,
  applyParamsToScript,
  validatorToScriptHash,
  validatorToAddress,
  scriptFromNative
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
export const mint_root_token = async (API, Contract_Merkle_Minter, VERBOSE=true) => {

  // Contract Initialization ---------------------------------------------------
  if (VERBOSE) { console.log("INFO: Parameterizing Contracts"); }

  // User Address
  const userAddress = await API.wallet().address()
  const paymentCredentialHash = paymentCredentialOf(userAddress).hash;

  // Policy IDs
  const policyId_Merkle_Minter = Contract_Merkle_Minter.script.hash

  const Script_Parameterized_Metadata = {
    type: "PlutusV3",
    script: applyParamsToScript(
      Validator_Metadata_Minter.cborHex,
      [policyId_Merkle_Minter, Data.to(true, Data.Boolean())]
    ),
  };
  const Address_Contract_Metadata_Minter = validatorToAddress("Preview", Script_Parameterized_Metadata);
  const policyId_Metadata_Minter = validatorToScriptHash(Script_Parameterized_Metadata)

  // Contract Addresses
  const Address_Contract_Merkle_Minter = Contract_Merkle_Minter.script.address;

  if (VERBOSE) { 
    console.log({
      "Contract Address - Merkle-Minter:": Address_Contract_Merkle_Minter,
      "Contract Address - Metadata-Minter:": Address_Contract_Metadata_Minter,
      "Policy ID - Merkle-Minter:": policyId_Merkle_Minter,
      "Policy ID - Metadata-Minter:": policyId_Metadata_Minter,
    })
  }

  // Configure Script Datum --------------------------------------------------
  if (VERBOSE) { console.log("INFO: Configuring Datum"); }

  const scriptDatumStructure = Data.Object({
    credential: Data.Bytes(),
    amnt: Data.Integer(),
  })
  const scriptDatum = Data.to({
    credential: paymentCredentialHash, 
    amnt: BigInt(1)
  }, scriptDatumStructure)

  // Build the First TX for script data hash ---------------------------------
  if (VERBOSE) { console.log("INFO: Building pseudo transaction") };
  const script_data_hash = await buildPseudoTX(API, metadata, scriptDatum)

  // Define Token Information -----------------------------------------------
  if (VERBOSE) { console.log("INFO: Defining Asset from Script Data Hash of Pseudo TX") };

  const quantity_token = 1 
  const asset_token = `${policyId_Metadata_Minter}${script_data_hash}`

  if (VERBOSE) { 
    console.log('Minting Token:', {
      "Asset": asset_token,
      "Quantity": quantity_token,
    })
  }

  // Set up redeemer components ---------------------------------------------
  // 1. Get contract UTxO for input reference
  const utxos_contract = await API.utxosAt(Address_Contract_Merkle_Minter)
  if (!utxos_contract.length) {
    throw new Error("No UTXOs found at contract address")
  }
  const utxo = utxos_contract[0];

  // Create input reference for redeemer
  const input_ref = new Constr(0, [
    fromText(utxo.txHash),
    BigInt(utxo.outputIndex),
  ]);

  // 2. Process metadata
  const metadata_obj = Data.fromJson(metadata)
  if (VERBOSE) { 
    console.log("Metadata:", metadata);
    console.log("Metadata Object:", metadata_obj);
  }
  
  const metadata_bytes = Data.to(metadata_obj)
  const metadata_hash = fromText(
    blake2b(32).update(Buffer.from(Data.to(metadata_obj))).digest('hex')
  )

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
    metadata_hash,                                    // metadata_hash: ByteArray
    fromText(Data.to(convertInputToCbor(collateralInput))), // collateral_inputs: ByteArray
    fromText(Data.to(                                // collateral_output: ByteArray
      new Constr(0, [
        fromText(userAddress),
        formatValue({ lovelace: BigInt(collateralInput.assets.lovelace - 5000000n) }),
        new Constr(0, [])
      ])
    )),
    fromText(Data.to(BigInt(5000000)))              // collateral_fee: ByteArray
  ]);

  // Construct final MintToken redeemer
  const mintRedeemer = Data.to(
    new Constr(0, [     // MintToken constructor
      input_ref,        // OutputReference
      tx_body,          // TransactionBodyPieces
      metadata_bytes    // Metadata (ByteArray)
    ])
  );

  if (VERBOSE) { 
    console.log("Redeemer Components:", {
      input_ref: Data.from(Data.to(input_ref)),
      tx_body: Data.from(Data.to(tx_body)),
      metadata: Data.from(metadata_bytes)
    })
  }

  // Build the Final TX -----------------------------------------------------
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
    .mintAssets({[asset_token]: BigInt(quantity_token)}, mintRedeemer)
    .attach.MintingPolicy(Script_Parameterized_Metadata)
    .attachMetadata(721n, metadata)
    .addSigner(userAddress)
    .selectCollateral([collateralInput])
    .complete({localUPLCEval: false});

  if (VERBOSE) { console.log("INFO: Raw TX", tx.toString()); }

  // Sign and Submit ------------------------------------------------------
  if (VERBOSE) {
    console.log(`${colors.cyan}INFO${colors.reset}: Requesting TX signature`);
  }
  const signedTx = await tx.sign().complete();

  // Submit the TX -----------------------------------------------------------
  if (VERBOSE) {
    console.log(`${colors.cyan}INFO${colors.reset}: Attempting to submit the transaction`);
  }
  const txHash = await signedTx.submit();

  // Return with TX hash -----------------------------------------------------
  console.log(`${colors.magenta}TX Hash${colors.reset}: ${txHash}`);

  return {
    tx_id: txHash,
    address: Address_Contract_Metadata_Minter,
    policy_id: policyId_Metadata_Minter,
  };
}