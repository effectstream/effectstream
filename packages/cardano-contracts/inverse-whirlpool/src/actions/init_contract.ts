import metadata from "../data/metadata.json" assert { type: "json" };
import Validator_Always_True from "../scripts/true.json" assert { type: "json" };
import Validator_Merkle_Mint from "../scripts/whirl.json" assert { type: "json" };
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
import { Store, Trie } from '@aiken-lang/merkle-patricia-forestry';

const VERBOSE = true;

const bigIntReplacer = (key: string, value: any) => {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return value;
};

// #############################################################################
// ## MINT MERKLE INIT
// #############################################################################
export const init_merkle = async (API, VERBOSE = true) => {
  // Initialize Lucid ------------------------------------------------------------
  const userAddress = await API.wallet().address();
  const paymentCredentialHash = paymentCredentialOf(userAddress).hash;
  
  if (VERBOSE) {
    console.log({
      'User Address:': userAddress,
      'Payment Credential:': paymentCredentialHash
    });
  }

  // Contract Initialization ---------------------------------------------------
  if (VERBOSE) { console.log("INFO: Parameterizing Contracts"); }

  // Get the User's UTXOs ------------------------------------------------------
  const utxos_user = await API.utxosAt(userAddress);
  const utxo = utxos_user[0];
  const consumingUserUTXO = new Constr(0, [
    utxo.txHash,
    BigInt(utxo.outputIndex),
  ]);

  if (!utxo) {
    throw new Error("No UTXOs found for user address");
  }

  const Script_Parameterized_Merkle = {
    type: "PlutusV3",
    script: applyParamsToScript(
      Validator_Merkle_Mint.cborHex ,
      [consumingUserUTXO]
    ),
  };
  console.log('Script_Parameterized', consumingUserUTXO)
  // console.log('Script_Parameterized', Script_Parameterized)
  const policyId_Script =  validatorToScriptHash(Script_Parameterized_Merkle)
  const Address_Script =  validatorToAddress("Preview", Script_Parameterized_Merkle)

  // Save the parameterized validator
  const dir_contract = 'data/contracts/' + Address_Script;
  if (!fs.existsSync(dir_contract)) {
    fs.mkdirSync(dir_contract, { recursive: true }, (err) => {
      if (err) throw err;
      console.log('Directory created:', dir_contract);
    });
  }
  fs.writeFileSync(dir_contract+'/param_script.json', JSON.stringify({
    'Validator': Script_Parameterized_Merkle,
    'hash': validatorToScriptHash(Script_Parameterized_Merkle),
    'address': validatorToAddress("Preview", Script_Parameterized_Merkle)
  }), { encoding: 'utf-8' });

  // Configure Script Datum and Redeemer ----------------------------------------
  if (VERBOSE) { console.log("INFO: Configuring Datum"); }

  // Create the merkle datum structure
  const merkleState = {
    root: "0000000000000000000000000000000000000000000000000000000000000000",
    ownHash: policyId_Script
  };
  const scriptDatumStructure = Data.Object({
    root:      Data.Bytes(),
    ownHash:   Data.Bytes(),
  })
  // Convert to Cardano data format
  const scriptDatum = Data.to(merkleState, scriptDatumStructure);

  // Define token details
  const assetName = "";  // Empty asset name as in original
  const quantity = 1n;
  const asset = `${policyId_Script}${assetName}`;

  // Build the TX ------------------------------------------------------------
  if (VERBOSE) { console.log("INFO: Building the TX"); }

  const tx = await API.newTx()
    .pay.ToContract(
      Address_Script,
      { kind: "inline", value: scriptDatum },
      { [asset]: quantity }
    )
    .collectFrom([utxo])
    .attach.MintingPolicy(Script_Parameterized_Merkle)
    .mintAssets(
      { [asset]: quantity },
      // InitMerkle redeemer
      Data.to(new Constr(0, []))
    )
    .addSigner(userAddress)
    .complete({localUPLCEval: false});

  // Request User Signature --------------------------------------------------
  console.log("INFO: Requesting TX signature");
  const signedTx = await tx.sign.withWallet().complete();

  // Submit the TX -----------------------------------------------------------
  console.log("INFO: Attempting to submit the transaction");
  const txHash = await signedTx.submit();

  if (!txHash) {
    console.log("Transaction submission failed");
    throw new Error("Transaction submission failed");
  }

  if (txHash) {
    fs.writeFileSync(
      dir_contract+'/state.json',
      JSON.stringify(merkleState, bigIntReplacer, 2),
      { encoding: 'utf-8' }
    );
  }

  // Return with TX hash -----------------------------------------------------
  console.log(`TX Hash: ${txHash}`);
  return {
    tx_id: txHash,
    address: Address_Script,
    policy_id: policyId_Script,
  };
};
