import { PaimaSTM } from "@paimaexample/sm";
import { grammar } from "@multi-chain-transfer/data-types/grammar";
import type { BaseStfInput, BaseStfOutput } from "@paimaexample/sm";
import {
  getEvmMidnightByOwner,
  getEvmMidnightByTokenId,
  insertEvmMidnight,
} from "@multi-chain-transfer/database";
import type { StartConfigGameStateTransitions } from "@paimaexample/runtime";
import { type SyncStateUpdateStream, World } from "@paimaexample/coroutine";
import { contractAddressesEvmMain } from "@multi-chain-transfer/evm-contracts";

const stm = new PaimaSTM<typeof grammar, any>(grammar);

// function decodeString(data: Record<string, number>, length: number) {
//   let str = "";
//   for (let i = 0; i < length; i++) {
//     str += String.fromCharCode(data[`${i}`]);
//   }
//   return str.trim();
// }

stm.addStateTransition("midnightContractState", function* (data) {
  const decodedData = new MidnightDecoder().decode(data.parsedInput.payload);

  // TODO Improve the midnight generic primitive to not need to decode the string.
  const payload = data.parsedInput.payload;
  console.error(
    "🎉 [MIDNIGHT] Transaction receipt:",
    JSON.stringify(payload),
    "\n",
    JSON.stringify(decodedData),
  );
});

stm.addStateTransition("transfer-to-midnight", function* (data) {
  const { midnight_address, amount } = data.parsedInput;
  const contract_address =
    contractAddressesEvmMain().chain31337["Erc1155DevModule#MCT_ERC1155"];
  console.log("🎉 [TRANSFER-TO-MIDNIGHT] Transaction receipt:");
  console.log(JSON.stringify(data.parsedInput));
  console.log("@ Contract address:", contract_address);
});

stm.addStateTransition("evm-transfer-erc1155", function* (data) {
  console.log("🎉 [TRANSFER-ASSETS] Transaction receipt:");
  //     🎉 [TRANSFER-ASSETS] Transaction receipt:
  // {
  //   "to": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
  //   "from": "0x0000000000000000000000000000000000000000",
  //   "tokenId": "1",
  //   "amount": "1111",
  //   "isMint": true,
  //   "isBurn": false
  // }
  console.log(JSON.stringify(data.parsedInput, null, 2));
  const { to, tokenId, isMint, amount, isBurn, from } = data.parsedInput;
  const contract_address =
    contractAddressesEvmMain().chain31337["Erc1155DevModule#MCT_ERC1155"];
  console.log("🎉 [TRANSFER-ASSETS] Contract address:", contract_address);

  const getBalance = function* (address: string) {
    const [evmMidnightBalances] = yield* World.resolve(getEvmMidnightByOwner, {
      contract_address,
      owner: address,
    });
    if (!evmMidnightBalances) return BigInt(0);
    return BigInt(evmMidnightBalances.amount);
  };

  const toBalance = yield* getBalance(to);
  const fromBalance = yield* getBalance(from);

  const isTransfer = !isMint && !isBurn;

  const updateFrom = isTransfer || isBurn;
  const updateTo = isTransfer || isMint || isBurn;

  // Update balances
  if (updateFrom) {
    yield* World.resolve(insertEvmMidnight, {
      contract_address,
      chain: "EVM",
      token_id: tokenId,
      amount: (fromBalance - BigInt(amount)).toString(),
      owner: from,
      block_height: data.blockHeight,
    });
  }
  if (updateTo) {
    yield* World.resolve(insertEvmMidnight, {
      contract_address,
      chain: "EVM",
      token_id: tokenId,
      amount: (toBalance + BigInt(amount)).toString(),
      owner: to,
      block_height: data.blockHeight,
    });
  }
});

// stm.finalize(); // this avoids people dynamically calling stm.addStateTransition after initialization

/**
 * This function allows you to route between different State Transition Functions
 * based on block height. In other words when a new update is pushed for your game
 * that includes new logic, this router allows your game node to cleanly maintain
 * backwards compatibility with the old history before the new update came into effect.
 * @param blockHeight - The block height to process the game state transitions for.
 * @param input - The input to process the game state transitions for.
 * @returns The result of the game state transitions.
 */
export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  if (blockHeight >= 0) {
    yield* stm.processInput(input);
  } else {
    yield* stm.processInput(input);
  }
  return;
};

// Midnight Decoder

class MidnightDecoder {
  /**
   * Converts a value object like { '0': 72, '1': 101 } to a sorted byte array [72, 101].
   * @param {object} valueData - The object containing numeric values with string keys.
   * @returns {number[]} A sorted array of byte values.
   */
  private valueObjectToByteArray(valueData: any) {
    if (!valueData || Object.keys(valueData).length === 0) {
      return [];
    }
    // Sort keys numerically to ensure correct byte order.
    const entries = Object.entries(valueData).map((
      [key, val]: [string, unknown],
    ) => [parseInt(key, 10), val as number]);
    entries.sort((a, b) => a[0] - b[0]);
    return entries.map((entry) => entry[1]);
  }

  /**
   * Decodes the content of a "cell" object based on its alignment descriptors.
   * @param {object} content - The content object from a cell, containing 'value' and 'alignment'.
   * @returns {any|any[]} The decoded value or an array of decoded values.
   */
  private decodeCellContent(content: any) {
    // Gracefully handle cell content that is empty or malformed.
    if (
      !content || !Array.isArray(content.alignment) ||
      !Array.isArray(content.value)
    ) {
      return null; // An empty or invalid cell decodes to null.
    }

    const { value: values, alignment: alignments } = content;
    const decodedParts = [];

    for (let i = 0; i < alignments.length; i++) {
      const alignment = alignments[i];
      const valueData = values[i] || {}; // Default to empty object if value part is missing.

      // Alignment is always an 'atom' wrapping the type descriptor.
      const typeDesc = alignment.value;
      const byteArray = this.valueObjectToByteArray(valueData);

      if (!typeDesc) {
        decodedParts.push(null); // Handle cases with missing type info.
        continue;
      }

      switch (typeDesc.tag) {
        case "compress":
          // The 'compress' tag indicates a string.
          decodedParts.push(String.fromCharCode(...byteArray));
          break;
        case "bytes":
          if (byteArray.length === 0) {
            decodedParts.push(null); // Represent empty byte arrays as null.
          } else if (byteArray.length === 1) {
            // If it's a single byte, return as a number for simplicity.
            decodedParts.push(byteArray[0]);
          } else {
            // Heuristic: Treat smaller byte arrays as little-endian numbers,
            // and larger ones (like hashes) as big-endian (direct order) hex strings.
            if (byteArray.length <= 6) {
              let numericValue = 0n;
              for (let j = 0; j < byteArray.length; j++) {
                numericValue += BigInt(byteArray[j]) << BigInt(8 * j);
              }
              decodedParts.push(Number(numericValue));
            } else {
              const hexString = byteArray.map((b) =>
                b.toString(16).padStart(2, "0")
              ).join("");
              decodedParts.push("0x" + hexString);
            }
          }
          break;
        case "null":
          decodedParts.push(null);
          break;
        default:
          // If we encounter an unknown type, return it raw for debugging.
          decodedParts.push({ unhandled_type: typeDesc, value: byteArray });
          break;
      }
    }

    // If a cell results in a single decoded part, return it directly.
    // Otherwise, return the full array of parts.
    return decodedParts.length === 1 ? decodedParts[0] : decodedParts;
  }

  /**
   * The main recursive decoder function.
   * @param {object} data - The JSON object to decode.
   * @returns {any} The decoded data.
   */
  public decode(data: any): any {
    try {
      if (!data || typeof data !== "object") {
        return data;
      }

      // Check for the main structural tags.
      if ("tag" in data) {
        switch (data.tag) {
          case "array":
            return data.content.map((item: any) => this.decode(item));
          case "map":
            // The example only has empty maps. A more general implementation
            // would handle an array of [key, value] tuples here.
            return {}; // For empty map content: {}
          case "cell":
            return this.decodeCellContent(data.content);
          case "atom":
            // An atom just wraps another value. Decode the inner value.
            return this.decode(data.value);
          case "null":
            return null;
          default:
            // This case handles type descriptor tags ('bytes', 'compress')
            // if passed directly. We return them as is.
            return data;
        }
      }

      // This handles the case where the object is the content of a cell.
      if ("value" in data && "alignment" in data) {
        return this.decodeCellContent(data);
      }

      // Return unknown objects as they are.
      return data;
    } catch (error) {
      // console.error("Error decoding data:", error);
      return null;
    }
  }
}
