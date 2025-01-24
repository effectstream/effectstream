import { toEventSignature } from "viem";
import type { TypeErrorMessage } from "@paima/utils";
import type {
  Abi,
  AbiEvent,
  AbiEventParameter,
  AbiFunction,
  AbiParameter,
  ExtractAbiEvents,
  ParseAbiItem,
} from "abitype";

type SignaturesFor<Event extends AbiEvent, Signature> = Event extends any
  ? SignatureAbiItem<Event> extends Signature ? Event : never
  : never;

export function getEvmEvent<
  const abi extends Abi,
  const Signature extends SignatureAbiItem<ExtractAbiEvents<abi>>,
>(
  abi: abi,
  signature: Signature,
): SignaturesFor<ExtractAbiEvents<abi>, Signature> {
  const events = abi.filter((item) => item.type === "event");
  for (const event of events) {
    const eventSig = toSignature(event);
    if (eventSig === signature) {
      return event as any;
    }
  }
  throw new Error(`Event signature ${signature} not found in ABI`);
}

// ==============================================
// NOTE: EVERYTHING BELOW THIS IS TAKEN FROM HERE
//       DO NOT MODIFY IT
//       https://github.com/wevm/viem/pull/2928
// ==============================================

type ToSignature<Signature extends string> = ParseAbiItem<Signature> extends
  never ? string
  : ParseAbiItem<Signature> extends AbiFunction | AbiEvent
    ? SignatureAbiItem<ParseAbiItem<Signature>>
  : never;

const toSignature = <const Def extends string | AbiFunction | AbiEvent>(
  def: Def,
): Def extends AbiFunction | AbiEvent ? SignatureAbiItem<Def>
  : Def extends string ? ToSignature<Def>
  : never => {
  return toEventSignature(def) as any;
};

type ValidateName<
  name extends string,
  checkCharacters extends boolean = false,
> = name extends `${string}${" "}${string}`
  ? TypeErrorMessage<`Identifier "${name}" cannot contain whitespace.`>
  : IsSolidityKeyword<name> extends true
    ? TypeErrorMessage<`"${name}" is a protected Solidity keyword.`>
  : name extends `${number}`
    ? TypeErrorMessage<`Identifier "${name}" cannot be a number string.`>
  : name extends `${number}${string}`
    ? TypeErrorMessage<`Identifier "${name}" cannot start with a number.`>
  : checkCharacters extends true ? IsValidCharacter<name> extends true ? name
    : TypeErrorMessage<`"${name}" contains invalid character.`>
  : name;

type IsValidCharacter<character extends string> = character extends
  `${ValidCharacters}${infer tail}` ? tail extends "" ? true
  : IsValidCharacter<tail>
  : false;

// biome-ignore format: no formatting
type ValidCharacters =
  // uppercase letters
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z"
  // lowercase letters
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z"
  // numbers
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  // special characters
  | "_"
  | "$";

type IsSolidityKeyword<type extends string> = type extends SolidityKeywords
  ? true
  : false;

type SolidityKeywords =
  | "after"
  | "alias"
  | "anonymous"
  | "apply"
  | "auto"
  | "byte"
  | "calldata"
  | "case"
  | "catch"
  | "constant"
  | "copyof"
  | "default"
  | "defined"
  | "error"
  | "event"
  | "external"
  | "false"
  | "final"
  | "function"
  | "immutable"
  | "implements"
  | "in"
  | "indexed"
  | "inline"
  | "internal"
  | "let"
  | "mapping"
  | "match"
  | "memory"
  | "mutable"
  | "null"
  | "of"
  | "override"
  | "partial"
  | "private"
  | "promise"
  | "public"
  | "pure"
  | "reference"
  | "relocatable"
  | "return"
  | "returns"
  | "sizeof"
  | "static"
  | "storage"
  | "struct"
  | "super"
  | "supports"
  | "switch"
  | "this"
  | "true"
  | "try"
  | "typedef"
  | "typeof"
  | "var"
  | "view"
  | "virtual"
  | `address${`[${string}]` | ""}`
  | `bool${`[${string}]` | ""}`
  | `string${`[${string}]` | ""}`
  | `tuple${`[${string}]` | ""}`
  | `bytes${number | ""}${`[${string}]` | ""}`
  | `${"u" | ""}int${number | ""}${`[${string}]` | ""}`;

type AssertName<name extends string> = ValidateName<name> extends
  infer invalidName extends string[] ? `[${invalidName[number]}]`
  : name;

// TODO: This looks cool. Need to check the performance of `new RegExp` versus defined inline though.
// https://twitter.com/GabrielVergnaud/status/1622906834343366657
function execTyped<type>(regex: RegExp, string: string) {
  const match = regex.exec(string);
  return match?.groups as type | undefined;
}

// https://regexr.com/7f7rv
const tupleRegex = /^tuple(?<array>(\[(\d*)\])*)$/;

type ExtractArray<abiParameter extends AbiParameter | AbiEventParameter> =
  abiParameter extends {
    type: `tuple${infer array}`;
  } ? array
    : "";

type TypesToCSV<T extends readonly (AbiParameter | AbiEventParameter)[]> =
  T extends readonly [
    infer First extends AbiParameter | AbiEventParameter,
    ...infer Rest extends readonly (AbiParameter | AbiEventParameter)[],
  ] ? `${First extends {
      components: infer Component extends readonly (
        | AbiParameter
        | AbiEventParameter
      )[];
    } ? `(${TypesToCSV<Component>})${ExtractArray<First>}`
      : First["type"]}${Rest["length"] extends 0 ? "" : `,${TypesToCSV<Rest>}`}`
    : "";

/**
 * Formats an ABI item into a signature
 *
 * @param abiItem - ABI item
 * @returns A signature
 *
 * @example
 * type Result = SignatureAbiParameter({ name: 'foo', type: 'event', inputs: [{ type: 'uint256' }, { type: 'uint256' }] })
 * //   ^? type Result: foo(uint256,uint256)
 */
type SignatureAbiItem<abiItem extends AbiFunction | AbiEvent> =
  | AbiFunction
  | AbiEvent extends abiItem ? string
  : `${AssertName<abiItem["name"]>}(${TypesToCSV<abiItem["inputs"]>})`;

/**
 * Formats an ABI function into a signature
 * Function: https://docs.soliditylang.org/en/develop/abi-spec.html#function-selector
 * Event: https://docs.soliditylang.org/en/develop/abi-spec.html#events
 *
 * @param abiItem - ABI item
 * @returns A signature
 *
 * @example
 * const signatureAbi = signatureAbiItem({ name: 'foo', type: 'event', inputs: [{ type: 'uint256' }, { type: 'uint256' }] })
 * //    ^? const signatureAbiItem: foo(uint256,uint256)
 */
function signatureAbiItem<const abiItem extends AbiFunction | AbiEvent>(
  abiItem: abiItem,
): SignatureAbiItem<abiItem> {
  return `${abiItem.name}(${
    abiItem.inputs.map((param) => signatureAbiParameter(param)).join(",")
  })` as SignatureAbiItem<abiItem>;
}

/**
 * Formats an ABI parameter into a piece of a signature
 *
 * @param abiParameter - ABI parameter
 * @returns A piece of a signature
 *
 * @example
 * type Result = SignatureAbiParameter({ type: 'uint256' })
 * //   ^? type Result: uint256
 */
type SignatureAbiParameter<
  abiParameter extends AbiParameter | AbiEventParameter,
> = TypesToCSV<[abiParameter]>[0];

/**
 * Formats an ABI parameter into a piece of a signature
 *
 * @param abiParameter - ABI parameter
 * @returns A piece of a signature
 *
 * @example
 * const signatureAbi = signatureAbiParameter({ type: 'uint256' })
 * //    ^? const signatureAbiItem: uint256
 */
function signatureAbiParameter<
  const abiParameter extends AbiParameter | AbiEventParameter,
>(abiParameter: abiParameter): SignatureAbiParameter<abiParameter> {
  let type = abiParameter.type;
  if (tupleRegex.test(abiParameter.type) && "components" in abiParameter) {
    type = "(";
    const length = abiParameter.components.length as number;
    for (let i = 0; i < length; i++) {
      const component = abiParameter.components[i]!;
      type += signatureAbiParameter(component);
      if (i < length - 1) type += ",";
    }
    const result = execTyped<{ array?: string }>(tupleRegex, abiParameter.type);
    type += `)${result?.array ?? ""}`;
    return signatureAbiParameter({
      ...abiParameter,
      type,
    }) as SignatureAbiParameter<abiParameter>;
  }
  return abiParameter.type;
}
