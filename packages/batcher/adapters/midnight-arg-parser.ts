// Type parser for converting JSON representations to Midnight-compatible types
// based on contract-info.json circuit definitions

export interface ContractInfo {
  circuits: CircuitDefinition[];
  witnesses: any[];
  contracts: any[];
}

export interface CircuitDefinition {
  name: string;
  pure: boolean;
  arguments: ArgumentDefinition[];
  "result-type": TypeDefinition;
}

export interface ArgumentDefinition {
  name: string;
  type: TypeDefinition;
}

export interface TypeDefinition {
  "type-name": string;
  maxval?: string;
  length?: number;
  tsType?: string;
  name?: string;
  elements?: ArgumentDefinition[];
  types?: TypeDefinition[];
}

/**
 * Parse circuit arguments from JSON format to Midnight-compatible types
 * @param circuitName - Name of the circuit to invoke
 * @param argsJson - Array of JSON arguments
 * @param contractInfo - Contract metadata from contract-info.json
 * @returns Parsed arguments ready for circuit invocation
 */
export function parseCircuitArgs(
  circuitName: string,
  argsJson: any[],
  contractInfo: ContractInfo,
): any[] {
  // Find circuit definition
  const circuitDef = contractInfo.circuits.find((c) => c.name === circuitName);
  if (!circuitDef) {
    throw new Error(
      `Circuit "${circuitName}" not found in contract. Available circuits: ${
        contractInfo.circuits.map((c) => c.name).join(", ")
      }`,
    );
  }

  // Validate argument count
  if (argsJson.length !== circuitDef.arguments.length) {
    throw new Error(
      `Circuit "${circuitName}" expects ${circuitDef.arguments.length} arguments, but got ${argsJson.length}`,
    );
  }

  // Parse each argument according to its type definition
  return circuitDef.arguments.map((argDef, index) => {
    try {
      return parseValue(argsJson[index], argDef.type);
    } catch (error) {
      throw new Error(
        `Failed to parse argument "${argDef.name}" (index ${index}) for circuit "${circuitName}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });
}

/**
 * Parse a value according to its type definition
 */
function parseValue(value: any, typeSpec: TypeDefinition): any {
  const typeName = typeSpec["type-name"];

  switch (typeName) {
    case "Uint":
      return parseUint(value, typeSpec);
    case "Bytes":
      return parseBytes(value, typeSpec.length!);
    case "Boolean":
      return parseBoolean(value);
    case "Opaque":
      return parseString(value);
    case "Struct":
      return parseStruct(value, typeSpec);
    case "Tuple":
      return parseTuple(value, typeSpec);
    default:
      throw new Error(`Unsupported type: ${typeName}`);
  }
}

/**
 * Parse Uint type to bigint
 * Validates non-negative values
 */
export function parseUint(
  value: string | number,
  typeSpec: TypeDefinition,
): bigint {
  if (typeof value === "string") {
    // Handle string representation of bigint
    try {
      const parsed = BigInt(value);
      if (parsed < 0n) {
        throw new Error("Uint values must be non-negative");
      }
      return parsed;
    } catch (error) {
      throw new Error(
        `Invalid Uint value "${value}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  } else if (typeof value === "number") {
    if (value < 0) {
      throw new Error("Uint values must be non-negative");
    }
    if (!Number.isInteger(value)) {
      throw new Error("Uint values must be integers");
    }
    return BigInt(value);
  } else {
    throw new Error(
      `Uint value must be a string or number, got ${typeof value}`,
    );
  }
}

/**
 * Parse Bytes type from hex string to Uint8Array
 * Validates hex format and length
 */
export function parseBytes(value: string, length: number): Uint8Array {
  if (typeof value !== "string") {
    throw new Error(`Bytes value must be a hex string, got ${typeof value}`);
  }

  // Strip 0x prefix if present
  let hex = value.toLowerCase();
  if (hex.startsWith("0x")) {
    hex = hex.slice(2);
  }

  // Validate hex format
  if (!/^[0-9a-f]*$/.test(hex)) {
    throw new Error(`Invalid hex string: "${value}"`);
  }

  // Ensure even length
  if (hex.length % 2 !== 0) {
    hex = "0" + hex;
  }

  // Convert to Uint8Array
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }

  // Validate length if specified
  if (length !== undefined && bytes.length !== length) {
    throw new Error(
      `Bytes length mismatch: expected ${length} bytes, got ${bytes.length}`,
    );
  }

  return bytes;
}

/**
 * Parse Boolean type
 */
export function parseBoolean(value: any): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Boolean value must be a boolean, got ${typeof value}`);
  }
  return value;
}

/**
 * Parse String type (Opaque)
 */
export function parseString(value: any): string {
  if (typeof value !== "string") {
    throw new Error(`String value must be a string, got ${typeof value}`);
  }
  return value;
}

/**
 * Parse Either struct type
 * Validates required fields: is_left, left, right
 */
export function parseEither(value: any, typeSpec: TypeDefinition): any {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Either value must be an object, got ${typeof value}`);
  }

  // Validate required fields
  if (!("is_left" in value)) {
    throw new Error('Either type must have "is_left" field');
  }
  if (!("left" in value)) {
    throw new Error('Either type must have "left" field');
  }
  if (!("right" in value)) {
    throw new Error('Either type must have "right" field');
  }

  // Parse as struct
  return parseStruct(value, typeSpec);
}

/**
 * Parse Struct type
 * Recursively parses nested structures
 */
export function parseStruct(value: any, typeSpec: TypeDefinition): any {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Struct value must be an object, got ${typeof value}`);
  }

  if (!typeSpec.elements) {
    throw new Error("Struct type definition missing elements");
  }

  const result: any = {};

  // Parse each field according to its type definition
  for (const element of typeSpec.elements) {
    const fieldName = element.name;

    if (!(fieldName in value)) {
      throw new Error(`Missing required field "${fieldName}" in struct`);
    }

    try {
      result[fieldName] = parseValue(value[fieldName], element.type);
    } catch (error) {
      throw new Error(
        `Failed to parse field "${fieldName}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return result;
}

/**
 * Parse Tuple type
 * Handles empty tuples and array types
 */
export function parseTuple(value: any, typeSpec: TypeDefinition): any[] {
  // Handle empty tuples
  if (!typeSpec.types || typeSpec.types.length === 0) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`Tuple value must be an array, got ${typeof value}`);
  }

  if (value.length !== typeSpec.types.length) {
    throw new Error(
      `Tuple length mismatch: expected ${typeSpec.types.length} elements, got ${value.length}`,
    );
  }

  return typeSpec.types.map((elementType, index) => {
    try {
      return parseValue(value[index], elementType);
    } catch (error) {
      throw new Error(
        `Failed to parse tuple element at index ${index}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });
}

/**
 * Parse Array type
 */
export function parseArray(value: any, typeSpec: TypeDefinition): any[] {
  if (!Array.isArray(value)) {
    throw new Error(`Array value must be an array, got ${typeof value}`);
  }

  // For arrays, we'd need the element type from the type spec
  // This would be similar to Tuple but with variable length
  // Implementation depends on how arrays are defined in contract-info.json
  return value.map((item, index) => {
    try {
      // This is a placeholder - actual implementation depends on type spec structure
      return item;
    } catch (error) {
      throw new Error(
        `Failed to parse array element at index ${index}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  });
}
