
import metadata from "./../data/metadata.json" assert { type: "json" };
import {
  paymentCredentialOf,
  Constr,
  Data,
  toHex,
  fromHex,
  scriptFromNative
} from "@lucid-evolution/lucid";
import blake2b from 'blake2b';
import fs from 'fs';
import { Store, Trie } from '@aiken-lang/merkle-patricia-forestry';
import {colors, bigIntReplacer} from "../util.ts"

const VERBOSE = true;

// #############################################################################
// ## MINT MERKLE INIT
// #############################################################################
export const create_account = async (API, contract) => {

  // Transacting Party Info ----------------------------------------------------
  const userAddress = await API.wallet().address()
  const paymentCredentialHash = paymentCredentialOf(userAddress).hash

  // Contract Info -------------------------------------------------------------
  const Address_Script = contract.script.address
  const policyId_Merkle_Minter = contract.script.hash
  const dir_contract = 'data/contracts/' + Address_Script;

  // Configure Script Datum and Redeemer ---------------------------------------
  if (VERBOSE) {
    console.log(`${colors.cyan}INFO${colors.reset}: Defining Contract Root Token`);
  }
  const asset_token_root = `${policyId_Merkle_Minter}${""}`
  const quantity_token_root = 1
  if (VERBOSE) {
    console.log(`${colors.cyan}Contract Root Token${colors.reset}:`);
    const output = {
      name: "",
      policy: policyId_Merkle_Minter,
      asset: asset_token_root,
      quantity: quantity_token_root
    };
    
    // Format each property with color
    Object.entries(output).forEach(([key, value]) => {
      console.log(`${colors.magenta}${key}${colors.reset}: ${value}`);
    });
  }

  // Get Relevant TX UTXO References -------------------------------------------
  if (VERBOSE) {
    console.log(`${colors.cyan}INFO${colors.reset}: Querying UTXO inputs`);
  } 
  const scriptUtxos = await API.utxosAt(Address_Script)
  const utxos_root_token = scriptUtxos.filter((object) => {
    return Object.keys(object.assets).includes(asset_token_root);
  });

  if (!utxos_root_token[0]) {
    console.log(colors.red + "ERROR" + colors.reset+":" + ` Root Asset ${asset_token_root} not found at Contract Address: ${Address_Script}`);
    return
  }

  if (VERBOSE) {
    console.log(colors.magenta + "Root Asset UTXO (Script)" + colors.reset+":");
    console.dir(utxos_root_token, { depth: null });
  }

  // Set up Redeemers --------------------------------------------------------
  if (VERBOSE) {
    console.log(`${colors.cyan}INFO${colors.reset}: Setting up Redeemers`);
  } 
  const output_index =  BigInt(utxos_root_token[0].outputIndex)
  
  const account = Data.to(
    new Constr(1, 
      [new Constr(0, [paymentCredentialHash]), BigInt(1)]
    ))

  let accountSerialized =  Data.to(new Constr(0, [paymentCredentialHash]))
  let accountHashed = blake2b(32).update(fromHex(accountSerialized)).digest('hex')
  
  console.log(`${colors.magenta}Serialized Account${colors.reset}: ${accountSerialized}`);  
  console.log(`${colors.magenta}Blake2b Account Hash${colors.reset}: ${accountHashed}`);  

  let merkle_tree = await new Trie(new Store(dir_contract+'/merkle_forest_db'));
  await merkle_tree.insert(accountHashed, accountHashed);
  //merkle_tree = await merkle_tree.insert("abc", "def");
  // await merkle_tree.save()
  console.log(colors.magenta + "Merkle Tree" + colors.reset+":");
  console.dir(merkle_tree, { depth: null });

  const merkle_tree_hash = await merkle_tree.hash;
  const merkle_tree_proof = await merkle_tree.prove(accountHashed)
  const merkle_tree_proof_hex = await merkle_tree_proof.toCBOR().toString('hex');

  if (VERBOSE) {
    console.log(`${colors.magenta}Merkle Tree Proof Hex${colors.reset}: ${merkle_tree_proof_hex}`);  
    console.log(`${colors.magenta}Merkle Tree Hash${colors.reset}: ${toHex(merkle_tree_hash)}`);  
    console.log(`${colors.cyan}Redeemer Parameters${colors.reset}:`);
    const output = {
      'account' : paymentCredentialHash,
      'merkle_tree_proof': merkle_tree_proof_hex,
      'output_index': output_index
    };
    
    // Format each property with color
    Object.entries(output).forEach(([key, value]) => {
      console.log(`${colors.magenta}${key}${colors.reset}: ${value}`);
    });
  }

  const mintRedeemer = Data.to(
    new Constr(1, [new Constr(0, [paymentCredentialHash]), Data.from(merkle_tree_proof_hex), output_index])
  ); 
  const spendRedeemer = Data.to(
    new Constr(1, [new Constr(0, [])])
  ); 

  if (VERBOSE) {  
    console.log(`${colors.magenta}Mint Redeemer${colors.reset}: ${mintRedeemer}`);  
    console.log(`${colors.magenta}Spend Redeemer${colors.reset}: ${spendRedeemer}`);  
  }

  // const scriptDatum_Mint = Data.to(
  //   new Constr(0, [toHex(merkle_tree_hash), policyId_Merkle_Minter])
  // ); 
  const scriptDatum_SpendRoot = Data.to(
    new Constr(0, [toHex(merkle_tree_hash), policyId_Merkle_Minter])
  ); 
  /* REF: 
    pub type State {
      Merkle { root: RootHash, own_hash: PolicyId }
      Account(Credential, Int)
    }
  */

  // Define Account Token ------------------------------------------------------
  const asset_token_account = `${policyId_Merkle_Minter}${accountHashed}`
  const quantity_token_account = 1

  // Build the TX --------------------------------------------------------------
  if (VERBOSE) {
    console.log(`${colors.cyan}INFO${colors.reset}: Building the TX`);
  }
  const tx = await API.newTx()
    .collectFrom(utxos_root_token, spendRedeemer)
    .pay.ToContract(
      Address_Script, 
      {kind: "inline", value: scriptDatum_SpendRoot},
      {[asset_token_root]: BigInt(quantity_token_root)},
    )
    .mintAssets({[asset_token_account]: BigInt(quantity_token_account)}, mintRedeemer)
    .pay.ToContract(
      Address_Script, 
      {kind: "inline", value: account},
      {[asset_token_account]: BigInt(quantity_token_account)},
    )
    .attach.MintingPolicy(contract.script.Validator)
    .attach.SpendingValidator(contract.script.Validator)
    .addSigner(userAddress)
    .complete();
  // if (VERBOSE) { console.log("INFO: Raw TX", tx.toString()); }

  // Request User Signature ----------------------------------------------------
  if (VERBOSE) {
    console.log(`${colors.cyan}INFO${colors.reset}: Requesting TX signature`);
  }
  const signedTx = await tx.sign.withWallet().complete();

  // Submit the TX -------------------------------------------------------------
  if (VERBOSE) {
    console.log(`${colors.cyan}INFO${colors.reset}: Attempting to submit the transaction`);
  }
  const txHash = await signedTx.submit();

  if (txHash) {
    // fs.writeFileSync(
    //   dir_contract+'/state.json',
    //   JSON.stringify(state, bigIntReplacer, 2),
    //   { encoding: 'utf-8' }
    // );
  }

  // Return with TX hash -------------------------------------------------------
  console.log(`${colors.magenta}TX Hash${colors.reset}: ${txHash}`);

  return {
    tx_id: txHash,
    address: Address_Script,
    policy_id: policyId_Merkle_Minter,
  };
}
