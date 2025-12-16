import * as D from 'io-ts/Decoder';

// io-ts Decoders take two type arguments, input and output type.
// Usually the input type is `unknown`, but TSOA pre-validates basic types
// so a string will be parsed as a number by the @Query decorator

export const psqlNum: D.Decoder<number, number> = {
  decode: n => (n > 0 && n < 2147483647 ? D.success(n) : D.failure(n, 'bad number')),
};
