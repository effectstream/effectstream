import type { TTuple, TIntersect, TLiteral, StaticDecode, TSchema } from '@sinclair/typebox';

export type ExtractParameterTypes<T extends readonly Readonly<[string, TSchema]>[]> = {
  [P in keyof T]: T[P] extends Readonly<[string, infer S extends TSchema]> ? S : never;
};
export type CommandTuple<
  Prefix extends string,
  T extends readonly Readonly<[string, TSchema]>[],
> = TTuple<[TLiteral<Prefix>, ...ExtractParameterTypes<T>]>;
export type CommandTuples<T extends Record<string, readonly Readonly<[string, TSchema]>[]>> = {
  [K in keyof T]: CommandTuple<K & string, T[K]>;
};

export type GrammarDefinition = Record<string, readonly Readonly<[string, TSchema]>[]>;
export type FullJsonGrammar<Grammar extends GrammarDefinition> = TIntersect<
  [CommandTuples<Grammar>[keyof Grammar]]
>;

export type ParamToData<T extends readonly Readonly<[string, TSchema]>[]> = {
  [K in T[number] as K[0]]: StaticDecode<K[1]>;
};

export type ParseInputResult<Grammar extends GrammarDefinition, Prefix extends keyof Grammar> = {
  [P in Prefix]: {
    prefix: P;
    grammar: CommandTuples<Grammar>[P];
    data: ParamToData<Grammar[P]>;
  };
}[Prefix];
