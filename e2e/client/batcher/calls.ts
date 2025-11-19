import * as bitcoinMessage from "bitcoinjs-message";
import { buildBitcoinSignatureMessage } from "@effectstream/batcher";
import type { DefaultBatcherInput } from "@effectstream/batcher";
import * as bitcoin from "bitcoinjs-lib";
import * as ecpair from "ecpair";
import * as tinysecp from "tiny-secp256k1";

const BATCHER_ENDPOINT = "http://localhost:3334/send-input";

const ECPair = ecpair.ECPairFactory(tinysecp);

interface BatcherResponse {
  success: boolean;
  message: string;
  inputsProcessed: number;
  transactionHash?: string;
  rollup?: number;
}

interface BitcoinRequest {
  toAddress: string;
  amountSats: number;
}

export async function sendBitcoin(
  privateKeyWIF: string,
  payload: BitcoinRequest,
  confirmationLevel: "no-wait" | "wait-receipt" | "wait-effectstream-processed" = "no-wait",
  network: bitcoin.Network = bitcoin.networks.regtest,
  target: string = "bitcoin"
): Promise<BatcherResponse> {
  const keyPair = ECPair.fromWIF(privateKeyWIF, network);
  const { address } = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network });
  
  if (!address) throw new Error("Could not derive address from private key");

  const timestamp = new Date().toISOString();
  const message = buildBitcoinSignatureMessage(payload, timestamp);
  
  // Sign the message
  const signature = bitcoinMessage.sign(message, keyPair.privateKey!, keyPair.compressed).toString('base64');

  const body = {
    address,
    input: JSON.stringify(payload),
    signature,
    timestamp,
    target,
    addressType: -1,
  };

  const response = await fetch(BATCHER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      data: body,
      confirmationLevel,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send Bitcoin transaction: ${response.statusText}`);
  }

  return response.json();
}
