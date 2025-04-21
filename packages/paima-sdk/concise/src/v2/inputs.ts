import { Value } from "@sinclair/typebox/value";
import type { StaticDecode, TSchema } from "@sinclair/typebox";
import type {
  CommandTuple,
  CommandTuples,
  GrammarDefinition,
  ParamToData,
  ParseInputResult,
} from "./types.ts";

export function parseStmInput<
  Grammar extends GrammarDefinition,
  Prefix extends keyof Grammar & string,
>(
  inputData: string,
  grammarDefinition: Grammar,
  keyedJsonGrammar: CommandTuples<Grammar>,
): ParseInputResult<Grammar, Prefix> {
  return parseRawStmInput(
    JSON.parse(inputData),
    grammarDefinition,
    keyedJsonGrammar,
  );
}
export function parseRawStmInput<
  Grammar extends GrammarDefinition,
  Prefix extends keyof Grammar & string,
>(
  parsedData: any,
  grammarDefinition: Grammar,
  keyedJsonGrammar: CommandTuples<Grammar>,
): ParseInputResult<Grammar, Prefix> {
  if (typeof parsedData !== "object") {
    throw new Error(`Input is not valid JSON`);
  }
  if (!Array.isArray(parsedData)) {
    throw new Error(`Input is not a valid JSON array`);
  }
  const prefix = parsedData[0];
  if (typeof prefix !== "string") {
    throw new Error(`Input does not have a valid prefix`);
  }
  if (!(prefix in keyedJsonGrammar)) {
    throw new Error(`Input has unknown prefix ${prefix}`);
  }
  const parsedInput = Value.Parse(keyedJsonGrammar[prefix], parsedData);

  const parsedInputObj = grammarDefinition[prefix].reduce(
    (acc, [key], idx) => {
      acc[key] = parsedInput[idx + 1];
      return acc;
    },
    {} as Record<string, any>,
  );

  return {
    prefix: prefix,
    grammar: keyedJsonGrammar[prefix],
    data: parsedInputObj,
  } as any; // typescript can't infer this
}

export function generateStmInput<
  Grammar extends GrammarDefinition,
  Prefix extends keyof Grammar & string,
>(
  grammar: Grammar,
  prefix: Prefix,
  data: ParamToData<Grammar[Prefix]>,
): StaticDecode<CommandTuples<Grammar>[Prefix]> {
  const tuple = [prefix, ...grammar[prefix].map((x) => (data as any)[x[0]])];
  return tuple as any;
}

export function generateRawStmInput<
  GrammarEntry extends readonly Readonly<[string, TSchema]>[],
  Prefix extends string,
>(
  grammar: GrammarEntry,
  prefix: Prefix,
  data: ParamToData<GrammarEntry>,
): StaticDecode<CommandTuple<Prefix, GrammarEntry>> {
  const tuple = [prefix, ...grammar.map((x) => (data as any)[x[0]])];
  return tuple as any;
}
