import type { Satisfies, Stringifiable, TypeErrorMessage } from "@paima/utils";

export type ErrorIfDefined<
  T,
  Success,
  ValName extends string = string,
> = T extends undefined ? Success
  : TypeErrorMessage<
    `${string extends ValName ? "Value" : ValName} has already been set`
  >;

// careful: this returns `never` in some cases
type IsStringifiable<A> = A extends Stringifiable ? true : false;

export type ErrorIfFalse<
  T extends boolean,
  Success,
  Value,
  Target,
  ValName extends string = string,
> = T extends true ? Success
  : TypeErrorMessage<
    `${string extends ValName ? "Value" : ValName} ${Value extends Stringifiable
      ? IsStringifiable<Target> extends never ? "is not in the right state"
      : IsStringifiable<Target> extends true
        ? `can only be set if ${Target & Stringifiable} is equal to ${Value}`
      : "is not in the right state"
      : "is not in the right state"}`
  >;

export function onlyOnce<
  const Step,
  const Func,
  const Name extends string = string,
>(param: {
  key: () => Step;
  name?: Name;
  build: Func;
}): ErrorIfDefined<Step, Func, Name> {
  return param.build as any;
}

export type ErrorIfMessage<
  T,
  Success,
  Name extends string = string, // TODO: do we need this?
> = T extends TypeErrorMessage<any> ? T : Success;

export function onlyNotError<
  const MaybeNever,
  const Func,
  const Name extends string,
>(param: {
  key: () => MaybeNever;
  name?: Name;
  build: Func;
}): ErrorIfMessage<MaybeNever, Func, Name> {
  return param.build as any;
}

export function onlyValue<
  const Value,
  const Target,
  const Func,
  const Name extends string = string,
>(param: {
  value: () => Value;
  target: () => Target;
  name?: Name;
  build: Func;
}): ErrorIfFalse<Satisfies<Target, Value>, Func, Value, Target, Name> {
  return param.build as any;
}
