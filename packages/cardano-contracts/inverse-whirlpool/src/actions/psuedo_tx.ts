import {
  Constr,
  Data,
  fromText,
  validatorToScriptHash,
  validatorToAddress,
  scriptFromNative
} from "@lucid-evolution/lucid";
import Validator_AlwaysTrue from "../scripts/true.json" assert { type: "json" };
import {colors} from "../util.js"

// Build pseudo-TX -------------------------------------------------------------
export  const buildPseudoTX = async (API, metadata, scriptDatum, VERBOSE=true) => {

  const userAddress = await API.wallet().address()

  const Script_AlwaysTrue = {
    type: "PlutusV3",
    script: Validator_AlwaysTrue.cborHex,
  };  
  const Address_Contract_AlwaysTrue = validatorToAddress("Preview", Script_AlwaysTrue);
  const policyId_AlwaysTrue = validatorToScriptHash(Script_AlwaysTrue)

  // Token 1 - Sacrificial token
  const assetName_token = "SampleTokenName"
  const quantity_token = 1 
  const asset_token = `${policyId_AlwaysTrue}${fromText(assetName_token)}`
  if (VERBOSE) { console.log(`${colors.cyan}AlwaysTrue Script Policy ID${colors.reset}: ${policyId_AlwaysTrue}`); }
  
  // Mint Action: InitMerkle (ref: validation.ak)
  const mintRedeemer = Data.to(
    new Constr(0, [])
  ); 

  // Build the First TX --------------------------------------------------------
  // build a tx just to be able to compute what the script data hash will be
  const script_data_hash = await (async () => {
    const tx = await API.newTx()
    .pay.ToAddressWithData(
      Address_Contract_AlwaysTrue, 
      { kind: "inline", value: scriptDatum },
      {},
    ) 
    .pay.ToAddress(
      userAddress, 
      {[asset_token]: BigInt(quantity_token)},
    )
    .mintAssets({[asset_token]: BigInt(quantity_token)}, mintRedeemer)
    .attach.MintingPolicy(Script_AlwaysTrue)
    .attachMetadata(721n, metadata)
    .addSigner(userAddress)
    .complete({localUPLCEval: false});
    
    return tx.toJSON().body.script_data_hash
  })();

  return script_data_hash
}

