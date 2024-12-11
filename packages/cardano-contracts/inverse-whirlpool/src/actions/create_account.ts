
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
export const create_account = async (API, contract) => {

  // Contract Initialization ---------------------------------------------------
  if (VERBOSE) { console.log("INFO: Parameterizing Contracts"); }

  // Transacting Party Info ----------------------------------------------------
  const userAddress = await API.wallet().address()
  const paymentCredentialHash = paymentCredentialOf(userAddress).hash

  // Contract Info -------------------------------------------------------------
  const Address_Contract_Merkle_Minter = contract.script.address
  const policyId_Merkle_Minter = contract.script.policy
  const dir_contract = 'data/contracts/' + Address_Contract_Merkle_Minter;

  // Configure Script Datum and Redeemer ----------------------------------------
  if (VERBOSE) { console.log("INFO: Configuring Datum"); }

  const asset_token_root = `${policyId_Merkle_Minter}${""}`
  const quantity_token_root = 1

  const scriptUtxos = await API.utxosAt(Address_Contract_Merkle_Minter)
  const assetCollateralTokenUTXO = scriptUtxos.filter((object) => {
    return Object.keys(object.assets).includes(asset_token_root);
  });
  console.log("Contract Token in at UTXO:", assetCollateralTokenUTXO)
  console.log("Output index:", assetCollateralTokenUTXO[0].outputIndex)

  // Mint Action: CreateAccount (ref: validation.ak)

  const output_index =  BigInt(assetCollateralTokenUTXO[0].outputIndex)
  
  console.log('pkh', paymentCredentialHash)
  const account = Data.to(
  new Constr(1, 
    [
      new Constr(0, [paymentCredentialHash]), BigInt(1)
    ]
  ))

  let accountSerialized =  Data.to(new Constr(0, [paymentCredentialHash]))
  let accountHashed = blake2b(32).update(fromHex(accountSerialized)).digest('hex')
  
  console.log('Serialized Account:', accountSerialized)
  console.log('Blake2b Account Hash:', accountHashed)

  let merkle_tree = await new Trie(new Store(dir_contract+'/merkle_forest_db'));
  await merkle_tree.insert(accountHashed, accountHashed);
  //merkle_tree = await merkle_tree.insert("abc", "def");
  // await merkle_tree.save()
  console.log('Merkle Tree:', merkle_tree)

  const merkle_tree_hash = await merkle_tree.hash;
//  const merkle_tree_proof = await merkle_tree.prove(Buffer.from(accountHashed))
  const merkle_tree_proof = await merkle_tree.prove(accountHashed)
  const merkle_tree_proof_hex = await merkle_tree_proof.toCBOR().toString('hex');

  console.log('merkle_tree_proof_hex', merkle_tree_proof_hex)
  console.log('Merkle Tree Info:',
  {
  'merkle_proof_hash': toHex(merkle_tree_hash),
  })
  console.log('Redeemer Parameters:', {
    'account' : paymentCredentialHash,
    'merkle_tree_proof': merkle_tree_proof_hex,
    'output_index': output_index
  })

  const mintRedeemer = Data.to(
    new Constr(1, [new Constr(0, [paymentCredentialHash]), Data.from(merkle_tree_proof_hex), output_index])
  ); 
  const spendRedeemer = Data.to(
    new Constr(1, [new Constr(0, [])])
  ); 
  console.log('Mint Redeemer:', mintRedeemer)
  console.log('Spend Redeemer:', spendRedeemer)


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

  const asset_token_account = `${policyId_Merkle_Minter}${accountHashed}`
  const quantity_token_account = 1

  // Build the Second TX -------------------------------------------------------
  if (VERBOSE) { console.log("INFO: Building the TX"); }
  const tx = await API.newTx()
    .pay.ToContract(
      Address_Contract_Merkle_Minter, 
      {inline: scriptDatum_SpendRoot},
      {[asset_token_root]: BigInt(quantity_token_root)},
    )
    .pay.ToContract(
      Address_Contract_Merkle_Minter, 
      {inline: account},
      {[asset_token_account]: BigInt(quantity_token_account)},
    )
    .mintAssets({[asset_token_account]: BigInt(quantity_token_account)}, mintRedeemer)
    .attachMintingPolicy(contract.script.Validator)
    .collectFrom(assetCollateralTokenUTXO, spendRedeemer)
    .attachSpendingValidator(contract.script.Validator)
    .addSigner(userAddress)
    .complete({localUPLCEval: false});
  // if (VERBOSE) { console.log("INFO: Raw TX", tx.toString()); }

  // Request User Signature ----------------------------------------------------
  console.log("INFO: Requesting TX signature");
  const signedTx = await tx.sign.withWallet().complete();

  // Submit the TX -------------------------------------------------------------
  console.log("INFO: Attempting to submit the transaction");
  const txHash = await signedTx.submit();

  if (txHash) {
    // fs.writeFileSync(
    //   dir_contract+'/state.json',
    //   JSON.stringify(state, bigIntReplacer, 2),
    //   { encoding: 'utf-8' }
    // );
  }

  // Return with TX hash -------------------------------------------------------
  return {
    tx_id: txHash,
    address: Address_Contract_Merkle_Minter,
    policy_id: policyId_Merkle_Minter,
  };
}
