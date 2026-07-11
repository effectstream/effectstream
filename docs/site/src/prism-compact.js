// Minimal Prism language definition for Compact (Midnight smart-contract
// language). Loaded via additionalLanguages in docusaurus.config.ts, which
// aliases the prismjs/components/prism-compact path to this file.
//
// `Prism` is assigned to globalThis by @docusaurus/theme-classic's
// prism-include-languages helper before requiring this file, so the bare
// reference below works at runtime.
//
// Extend the keyword / builtin / class-name lists as we add more real
// Compact examples to the docs.

Prism.languages.compact = {
  comment: [
    { pattern: /\/\/.*$/m, greedy: true },
    { pattern: /\/\*[\s\S]*?\*\//, greedy: true },
  ],
  string: {
    pattern: /(["'])(?:\\.|(?!\1).)*\1/,
    greedy: true,
  },
  pragma: {
    pattern: /\bpragma\b[^;]*/,
    inside: {
      keyword: /\b(?:pragma|language_version)\b/,
      operator: /[<>=]+/,
      number: /\d+(?:\.\d+)*/,
    },
  },
  keyword:
    /\b(?:assert|as|circuit|const|constructor|else|export|if|import|ledger|let|prefix|return|struct|witness)\b/,
  boolean: /\b(?:true|false)\b/,
  'class-name':
    /\b(?:Boolean|Bytes|ContractAddress|Counter|Either|LastTransfer|Map|Opaque|Set|ShieldedCoinInfo|Uint|UserAddress|Vector|ZswapCoinPublicKey)\b/,
  builtin:
    /\b(?:disclose|evolveNonce|increment|insert|left|member|mintShieldedToken|mintUnshieldedToken|ownPublicKey|pad|persistentHash|public_key|read|right)\b/,
  // Witness function name prefix (e.g. `private$secret_key`)
  function: /\b[a-zA-Z_$][\w$]*(?=\s*\()/,
  number: /\b\d+(?:\.\d+)?\b/,
  operator: /[=+\-*/<>!&|^%]+/,
  punctuation: /[{}[\]();,.:]/,
};
