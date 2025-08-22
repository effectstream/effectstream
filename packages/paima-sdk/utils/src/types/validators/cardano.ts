// import { crc32 } from "@foxglove/crc";
import * as crc32 from "crc-32";
import { CHECKSUM_ERROR_MSG, MALFORMED_ERROR_MSG } from "./utils.ts";
import { MiniCborReader } from "./minicbor.ts";
import bs58 from "bs58";
import { bech32 } from "bech32";
import { Buffer } from "node:buffer";

const CHECKSUM_ADDRESS_ERROR_MSG = CHECKSUM_ERROR_MSG("address");

export const InvalidArgumentError = Error;

/**
 * Example address:
 * - (mainnet icarus) Ae2tdPwUPEZFRbyhz3cpfC2CumGzNkFBN2L42rcUc2yjQpEkxDbkPodpMAi
 * - (testnet byron) 37btjrVyb4KDXBNC4haBVPCrro8AQPHwvCMp3RFhhSVWwfFmZ6wwzSK6JK1hY6wHNmtrpTf1kdbva8TCneM2YsiXT7mrzT21EacHnPpz5YyUdj64na
 * - (mainnet byron) 82d818584283581caf335162c1ecb0a5b95342e3d1d0c9c38a246fa976b077e81dea9d9ba101581e581c2d574aa85a82a80fd6d1c51ea115c2b03b68166230a3c383c9f89ad5001ac3de014e
 */
export function verifyCardanoByronAddress(address: string): boolean {
  return verifyCardanoByronAddressBytes(bs58.decode(address));
}
function verifyCardanoByronAddressBytes(data: Uint8Array): boolean {
  const reader = new MiniCborReader(Buffer.from(data).toString("hex"));

  reader.readStartArray();
  reader.readTag();

  const addressDataEncoded = reader.readByteString();

  // if (Number(reader.readInt()) !== crc32(addressDataEncoded)) { // foxglove
  if (Number(reader.readInt()) !== crc32.buf(addressDataEncoded)) { // crc-32
    throw new Error(CHECKSUM_ADDRESS_ERROR_MSG);
  }

  // skip the rest of the address verification and assume if the checksum matches the rest is okay

  return true;
}

export enum AddressType {
  BasePaymentKeyStakeKey = 0b0000,
  BasePaymentScriptStakeKey = 0b0001,
  BasePaymentKeyStakeScript = 0b0010,
  BasePaymentScriptStakeScript = 0b0011,
  PointerKey = 0b0100,
  PointerScript = 0b0101,
  EnterpriseKey = 0b0110,
  EnterpriseScript = 0b0111,
  // 0b1000 was chosen because all existing Byron addresses actually start with 0b1000,
  // therefore we can re-use Byron addresses as-is
  Byron = 0b1000,
  RewardKey = 0b1110,
  RewardScript = 0b1111,
  // 1001-1101 are left for future formats
}

/**
 * See: https://github.com/input-output-hk/cardano-js-sdk/blob/d1544fc9d1fb3997eb7c5b94a233789bb9e5cd9f/packages/core/src/Cardano/Address/Address.ts
 */
export function verifyCardanoShelleyAddress(address: string): boolean {
  const bech32data = bech32.decode(address, Number.MAX_SAFE_INTEGER / 2);
  const data = bech32.fromWords(bech32data.words);

  // strictly speaking, you don't have to use these prefixes
  // but it's a good sanity check
  // see CIP5
  if (
    !["addr", "addr_test", "stake", "stake_test"].includes(bech32data.prefix)
  ) {
    return false;
  }

  const type = data[0] >> 4;

  switch (type) {
    case AddressType.BasePaymentKeyStakeKey:
    case AddressType.BasePaymentScriptStakeKey:
    case AddressType.BasePaymentKeyStakeScript:
    case AddressType.BasePaymentScriptStakeScript: {
      return data.length === 57;
    }
    case AddressType.PointerKey:
    case AddressType.PointerScript: {
      if (data.length <= 29) {
        return false;
      }
      let index = 29;
      const dataBuffer = Buffer.from(data);
      const { bytesRead: slotBytes } = variableLengthDecode(
        dataBuffer.subarray(index),
      );

      index += slotBytes;
      const { bytesRead: txIndexBytes } = variableLengthDecode(
        dataBuffer.subarray(index),
      );

      index += txIndexBytes;
      variableLengthDecode(dataBuffer.subarray(index));
      return true;
    }
    case AddressType.EnterpriseKey:
    case AddressType.EnterpriseScript: {
      return data.length === 47;
    }
    case AddressType.RewardKey:
    case AddressType.RewardScript: {
      return data.length === 47;
    }
    case AddressType.Byron: {
      return verifyCardanoByronAddressBytes(new Uint8Array(data));
    }
    default:
      throw new Error(MALFORMED_ERROR_MSG("address"));
  }
}

/**
 * Decodes a value previously encoded in a variable length array.
 *
 * @param array The encoded value.
 * @returns the decoded value.
 */
const variableLengthDecode = (
  array: Buffer,
): { value: bigint; bytesRead: number } => {
  let more = true;
  let value = 0n;

  let bytesRead = 0;
  while (more && bytesRead < array.length) {
    const b = array[bytesRead];
    value <<= 7n;
    value |= BigInt(b & 127);

    more = (b & 128) !== 0;
    ++bytesRead;
  }

  return { bytesRead, value };
};
