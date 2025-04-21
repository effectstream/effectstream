import { Type } from "@sinclair/typebox";
import type {
  CommandTuples,
  FullJsonGrammar,
  GrammarDefinition,
} from "./types.ts";

export function toFullJsonGrammar<Grammar extends GrammarDefinition>(
  grammar: CommandTuples<Grammar>,
): FullJsonGrammar<Grammar> {
  const tuples = Object.values(grammar);
  return Type.Intersect(tuples) as any;
}
export function toKeyedJsonGrammar<Grammar extends GrammarDefinition>(
  grammar: Grammar,
): CommandTuples<Grammar> {
  const keyedTypes = Object.fromEntries(
    Object.entries(grammar).map(([command, params]) => {
      const paramTypes = params.map(([_, paramType]) => paramType);
      const tupleType = Type.Tuple([Type.Literal(command), ...paramTypes]);
      return [command, tupleType];
    }),
  );
  return keyedTypes as any;
}

/**
 * Useful for quickly checking if an input data is of a specific type without parsing the full object
 */
export function usesPrefix(inputData: string, prefix: string): boolean {
  return inputData.startsWith(`["${prefix}`);
}
