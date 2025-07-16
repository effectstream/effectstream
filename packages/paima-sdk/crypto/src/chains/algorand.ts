// import type { SignedTransaction, Transaction, SuggestedParams } from 'algosdk';
// import { doLog, hexStringToUint8Array } from '@paima/utils';
// import web3UtilsPkg from 'web3-utils';
// import type { IVerify } from './IVerify.js';

// export class AlgorandCrypto implements IVerify {
//   verifyAddress = async (address: string): Promise<boolean> => {
//     // TODO: improve
//     return await Promise.resolve(/^[A-Z2-7]{58}$/.test(address));
//   };
//   verifySignature = async (
//     userAddress: string,
//     message: string,
//     signature: string
//   ): Promise<boolean> => {
//     try {
//       const sig = Buffer.from(hexStringToUint8Array(signature));
//       const txn = await this.buildAlgorandTransaction(userAddress, message);
//       const signedTx: SignedTransaction = {
//         txn,
//         sig,
//       };
//       return await this.verifySignedTransaction(signedTx);
//     } catch (err) {
//       doLog(`[funnel] error verifying algorand signature: ${err}`);
//       return await Promise.resolve(false);
//     }
//   };

//   buildAlgorandTransaction = async (userAddress: string, message: string): Promise<Transaction> => {
//     const hexMessage = web3UtilsPkg.utf8ToHex(message).slice(2);
//     const msgArray = hexStringToUint8Array(hexMessage);
//     const SUGGESTED_PARAMS: SuggestedParams = {
//       fee: 0,
//       firstRound: 10,
//       lastRound: 10,
//       genesisID: 'mainnet-v1.0',
//       genesisHash: 'wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=',
//     };
//     const { makePaymentTxnWithSuggestedParams } = await import('algosdk');
//     return makePaymentTxnWithSuggestedParams(
//       userAddress,
//       userAddress,
//       0,
//       undefined,
//       msgArray,
//       SUGGESTED_PARAMS
//     );
//   };

//   verifySignedTransaction = async (signedTransaction: SignedTransaction): Promise<boolean> => {
//     if (signedTransaction.sig === undefined) return false;

//     const pkBytes = signedTransaction.txn.from.publicKey;

//     const signatureBytes = new Uint8Array(signedTransaction.sig);

//     const { encodeObj } = await import('algosdk');
//     const transactionBytes = encodeObj(signedTransaction.txn.get_obj_for_encoding());
//     const messageBytes = new Uint8Array(transactionBytes.length + 2);
//     messageBytes.set(Buffer.from('TX'));
//     messageBytes.set(transactionBytes, 2);

//     const { sign } = await import('tweetnacl');
//     return sign.detached.verify(messageBytes, signatureBytes, pkBytes);
//   };

//   decodeSignedTransaction = async (signedTx: Uint8Array): Promise<SignedTransaction> => {
//     const { decodeSignedTransaction } = await import('algosdk');
//     return decodeSignedTransaction(signedTx);
//   };
// }
