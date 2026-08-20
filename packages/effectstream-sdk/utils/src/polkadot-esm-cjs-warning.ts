/**
 * Side-effect-only module. Import it as the FIRST statement of any module that
 * imports a `@polkadot/*` package (directly, or via a wrapper such as
 * `avail-js-sdk`), and never import it lazily.
 *
 * Why: every `@polkadot/*` package registers itself in `globalThis.__polkadotjs`
 * at load time and warns when it sees more than one entry for the same package.
 * We load two entries — but of the same version, in two module formats:
 *
 *   esm  `@effectstream/crypto` ships raw TS, so Bun loads it as ESM, and
 *        `chains/polkadot.ts` pulls the ESM build of `@polkadot/util-crypto`.
 *   cjs  `avail-js-sdk` is CommonJS-only, so its `require("@polkadot/api")`
 *        can only ever resolve the `cjs/` build.
 *
 * The result is six warnings ("@polkadot/util has multiple versions...") on
 * every start, telling the user to pin or dedupe. There is nothing to dedupe:
 * only one version of each package is installed. Setting the flag below is the
 * escape hatch `@polkadot/util` provides for exactly this case — it suppresses
 * the message only when every registered entry has the same version, so a
 * genuine multi-version conflict still warns.
 *
 * To see the warnings again, set POLKADOTJS_DISABLE_ESM_CJS_WARNING=0 — an
 * explicit value in the environment always wins over the default set here.
 *
 * Ordering matters: `@polkadot/util` reads this variable while it is being
 * evaluated, i.e. during the first `@polkadot/*` import in the process. Setting
 * it afterwards has no effect.
 *
 * See spec/00009-polkadot-package-conflicts.md in the organizer workspace for
 * the captured stack traces behind the two loads.
 */
const FLAG = "POLKADOTJS_DISABLE_ESM_CJS_WARNING";

// `process` is absent in browser/bundler builds; there is nothing to set there.
const env = globalThis.process?.env;

if (env && env[FLAG] === undefined) {
  env[FLAG] = "1";
}
