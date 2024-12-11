use inverse_whirlpool/conversion.{
  convert_extra_signatories, convert_fee, convert_inputs, convert_mint,
  convert_outputs,
}

// test convert_extra_signatories_1() {
//   let extra_signatories =
//   let expected_result = #"abc"
//   expected_result == convert_extra_signatories(extra_signatories)
// }

// test convert_fee_1() {
//   let fee = 
//   let expected_result = #"abc"
//   expected_result == convert_fee(fee)
// }

// test convert_inputs_1() {
//   let inputs = 
//   let expected_result = #"abc"
//   expected_result == convert_inputs(extra_signatories)
// }

// test convert_mint_1() {
//   let mint = 
//   let expected_result = #"abc"
//   expected_result == convert_mint(mint)
// }

// test convert_outputs_1() {
//   let outputs = 
//   let expected_result = #"abc"
//   expected_result == convert_outputs(outputs)
// }

// test foo() {
//   trace cbor.diagnostic(#"aabbccddeeff")
//   trace cbor.serialise(#"aabbccddeeff") |> bytearray.to_hex()

//   trace cbor.diagnostic(
//     #"aabbccddeeffaabbccddeeffaabbccddeeffaabbccddeeffaabbccddeeffaabb",
//   )
//   trace cbor.serialise(
//     #"aabbccddeeffaabbccddeeffaabbccddeeffaabbccddeeffaabbccddeeffaabb",
//   )
//     |> bytearray.to_hex()

//   trace cbor.diagnostic(
//     (#"aabbccddeeffaabbccddeeffaabbccddeeffaabbccddeeffaabbccddeeffaabb", 256),
//   )
//   trace cbor.serialise(
//     (#"aabbccddeeffaabbccddeeffaabbccddeeffaabbccddeeffaabbccddeeffaabb", 256),
//   )
//     |> bytearray.to_hex()

//   True
// }

// test foo2() {
//   trace [
//     Pair(#"00e568406499afa042fd1f34207d1d5b4a3d87ec2767ccfd7b5e087d",
//     [
//       Pair(#"4465706f7369746f7279204e6f7465", -1),
//       Pair(#"624b47304a386b61525a4f34785a7432673670415267", 1),
//     ]),
//   ]
//     |> cbor.diagnostic
//   trace [
//     Pair(#"00e568406499afa042fd1f34207d1d5b4a3d87ec2767ccfd7b5e087d",
//     [
//       Pair(#"4465706f7369746f7279204e6f7465", -1),
//       Pair(#"624b47304a386b61525a4f34785a7432673670415267", 1),
//     ]),
//   ]
//     |> builtin.serialise_data
//     |> bytearray.to_hex

//   True
// }
