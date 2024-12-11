import 'dotenv/config';

// Initialize Lucid ------------------------------------------------------------
export const api_blockfrost = async (network) => {

  let key

  if (network == "Preview") {
    key =  process.env.BLOCKFROST_PREVIEW
  } else if (network == "Mainnet") {
    key =  process.env.BLOCKFROST_PREVIEW
  } else {
    return
  }

  const api = await Lucid.new(
    new Blockfrost(
      "https://cardano-"+network.toLowerCase()+".blockfrost.io/api/v0", 
      key),
      network,
  );

  return api;
}

// Retrieve validators from plutus.json ----------------------------------------
export function getValidators(endpoints, contract)  {

  var Validators = {}

  endpoints.forEach(function (endpoint) {
    Validators[endpoint.alias] =  {
      type: "PlutusV3",
      script: contract.validators.find((v) => v.title === endpoint.validator).compiledCode,
    }
  });
  return Validators
}

// Build pseudo-TX -------------------------------------------------------------
export  const buildPseudoTX = async (API, Validator_AlwaysTrue, metadata, scriptDatum, VERBOSE=false) => {

  const userAddress = await API.wallet.address()
  const Address_Contract_AlwaysTrue = API.utils.validatorToAddress(Validator_AlwaysTrue);
  const policyId_AlwaysTrue = API.utils.validatorToScriptHash(Validator_AlwaysTrue)

  // Token 1 - Sacrificial token
  const assetName_token = "SampleTokenName"
  const quantity_token = 1 
  const asset_token = `${policyId_AlwaysTrue}${fromText(assetName_token)}`

  // Mint Action: InitMerkle (ref: validation.ak)
  const mintRedeemer = Data.to(
    new Constr(0, [])
  ); 

  // Build the First TX --------------------------------------------------------
  // build a tx just to be able to compute what the script data hash will be
  if (VERBOSE) { console.log("INFO: Building the Pseudo TX"); }
  const script_data_hash = await (async () => {
    const tx = await API.newTx()
    .pay.ToAddressWithData(
      Address_Contract_AlwaysTrue, 
      {inline: scriptDatum},
      {},
    ) 
    .pay.ToAddress(
      userAddress, 
      {[asset_token]: BigInt(quantity_token)},
    ) 
    .mintAssets({[asset_token]: BigInt(quantity_token)}, mintRedeemer)
    .attachMintingPolicy(Validator_AlwaysTrue)
    .attachMetadata(721n, metadata)
    .addSigner(userAddress)
    .complete();
    if (VERBOSE) { console.log("INFO: Raw Pseudo TX", tx.toString()); }

    return tx.txComplete.body().script_data_hash().to_hex();
  })();

  return script_data_hash
}


