// E8 (00050): `parseCircuitArgs` understands the two type names compactc 0.35.0
// emits for an `Ed25519Signature` argument: `Curve25519Point` (affine `{x, y}`)
// and `Curve25519Scalar`. Only ranges are checked (x, y < 2^255 - 19; s < L);
// curve membership is left to the contract's own runtime and `ed25519Verify`.
//
// Fixture: the `mintFromSolana` definition from the solana-midnight-bridge
// template's compiled `contract-info.json` (compactc 0.35.0, raw, untranslated).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";

import { MidnightAdapter } from "../adapters/midnight-adapter.ts";
import {
  type ContractInfo,
  CURVE25519_FIELD_MODULUS,
  ED25519_GROUP_ORDER,
  parseCircuitArgs,
  parseCurve25519Point,
  parseCurve25519Scalar,
} from "../adapters/midnight-arg-parser.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const rawContractInfo = JSON.parse(
  readFileSync(
    path.join(
      import.meta.dirname!,
      "fixtures",
      "bridge-mint-from-solana.contract-info.json",
    ),
    "utf8",
  ),
) as ContractInfo;

const P = CURVE25519_FIELD_MODULUS;
const L = ED25519_GROUP_ORDER;

// The Ed25519 base point (RFC 8032), a valid curve point in affine coordinates.
const BX =
  15112221349535400772501151409588531511454012693041857206046113283949847762202n;
const BY =
  46316835694926478169428394003475163141307993866256225615783033603165251855960n;
const S = 1234567890123456789012345678901234567890n;

const CPK = "0102030405060708091011121314151617181920212223242526272829303132";
const EPK = "a1a2a3a4a5a6a7a8a9b0b1b2b3b4b5b6b7b8b9c0c1c2c3c4c5c6c7c8c9d0d1d2";
const MINT_NONCE = "ab".repeat(32);

/** `mintFromSolana`'s JSON arguments, as the bridge relayer enqueues them. */
function mintArgs(sig: unknown): unknown[] {
  return [
    "7",
    {
      is_left: true,
      left: { bytes: CPK },
      right: { bytes: "00".repeat(32) },
    },
    "10000000",
    MINT_NONCE,
    sig,
  ];
}

const sigJson = (x: unknown, y: unknown, s: unknown) => ({ r: { x, y }, s });

describe("fixture (compactc 0.35.0 contract-info.json)", () => {
  test("is the raw mintFromSolana definition with the Curve25519 type names", () => {
    expect((rawContractInfo as any)["compiler-version"]).toBe("0.35.0");
    const circuit = rawContractInfo.circuits.find((c) =>
      c.name === "mintFromSolana"
    )!;
    expect(circuit.arguments.map((a) => a.name)).toEqual([
      "lockNonce",
      "recipient",
      "amount",
      "mintNonce",
      "sig",
    ]);
    const sig = circuit.arguments[4].type;
    expect(sig["type-name"]).toBe("Struct");
    expect(sig.name).toBe("Ed25519Signature");
    expect(sig.elements).toEqual([
      { name: "r", type: { "type-name": "Curve25519Point" } },
      { name: "s", type: { "type-name": "Curve25519Scalar" } },
    ]);
  });
});

describe("parseCircuitArgs with Curve25519 types (E8)", () => {
  test("mintFromSolana JSON args parse to the circuit values, sig as {r: {x, y}, s} bigints", () => {
    const parsed = parseCircuitArgs(
      "mintFromSolana",
      mintArgs(sigJson(BX.toString(), BY.toString(), S.toString())),
      rawContractInfo,
    );
    expect(parsed[0]).toBe(7n);
    expect(parsed[1].is_left).toBe(true);
    expect(parsed[1].left.bytes).toEqual(Buffer.from(CPK, "hex"));
    expect(parsed[1].right.bytes).toEqual(new Uint8Array(32));
    expect(parsed[2]).toBe(10_000_000n);
    expect(parsed[3]).toEqual(Buffer.from(MINT_NONCE, "hex"));
    expect(parsed[4]).toEqual({ r: { x: BX, y: BY }, s: S });
    expect(typeof parsed[4].r.x).toBe("bigint");
    expect(typeof parsed[4].r.y).toBe("bigint");
    expect(typeof parsed[4].s).toBe("bigint");
  });

  test("bigint inputs are accepted as well as decimal strings", () => {
    const parsed = parseCircuitArgs(
      "mintFromSolana",
      mintArgs(sigJson(BX, BY, S)),
      rawContractInfo,
    );
    expect(parsed[4]).toEqual({ r: { x: BX, y: BY }, s: S });
  });

  test("range edges: p - 1 and L - 1 are accepted; 0 is accepted", () => {
    expect(parseCurve25519Point({ x: (P - 1n).toString(), y: "0" })).toEqual({
      x: P - 1n,
      y: 0n,
    });
    expect(parseCurve25519Scalar((L - 1n).toString())).toBe(L - 1n);
    expect(parseCurve25519Scalar(0n)).toBe(0n);
  });

  test("out-of-range x, y and s are refused, naming the argument and field", () => {
    const cases: Array<[unknown, RegExp]> = [
      [
        sigJson(P.toString(), BY.toString(), S.toString()),
        /argument "sig".*field "r".*Curve25519Point x must be < 2\^255 - 19/,
      ],
      [
        sigJson(BX.toString(), P.toString(), S.toString()),
        /argument "sig".*field "r".*Curve25519Point y must be < 2\^255 - 19/,
      ],
      [
        sigJson(BX.toString(), (P + 12345n).toString(), S.toString()),
        /Curve25519Point y must be < 2\^255 - 19/,
      ],
      [
        sigJson((1n << 256n).toString(), BY.toString(), S.toString()),
        /Curve25519Point x must be < 2\^255 - 19/,
      ],
      [
        sigJson(BX.toString(), BY.toString(), L.toString()),
        /argument "sig".*field "s".*Curve25519Scalar must be < L/,
      ],
      [
        sigJson(BX.toString(), BY.toString(), (L + 1n).toString()),
        /Curve25519Scalar must be < L/,
      ],
      [sigJson(P, BY, S), /Curve25519Point x must be < 2\^255 - 19/],
      [sigJson(BX, BY, L), /Curve25519Scalar must be < L/],
    ];
    for (const [sig, error] of cases) {
      expect(() =>
        parseCircuitArgs("mintFromSolana", mintArgs(sig), rawContractInfo)
      ).toThrow(error);
    }
  });

  test("malformed points and scalars are refused", () => {
    const badPoints: Array<[unknown, RegExp]> = [
      [null, /must be an object \{x, y\}, got null/],
      ["123", /must be an object \{x, y\}, got string/],
      [[BX.toString(), BY.toString()], /must be an object \{x, y\}, got array/],
      [{ x: BX.toString() }, /missing field "y"/],
      [{ y: BY.toString() }, /missing field "x"/],
      [
        { x: BX.toString(), y: BY.toString(), z: "1" },
        /unknown field "z"; expected exactly \{x, y\}/,
      ],
      [{ x: -1n, y: BY }, /x must be non-negative/],
      [{ x: "-1", y: BY.toString() }, /x must be a non-negative decimal integer string/],
      [{ x: "0x10", y: BY.toString() }, /decimal integer string, got "0x10"/],
      [{ x: "", y: BY.toString() }, /decimal integer string, got ""/],
      [{ x: " 1", y: BY.toString() }, /decimal integer string/],
      [{ x: "1.5", y: BY.toString() }, /decimal integer string/],
      [{ x: 5, y: BY.toString() }, /x must be a decimal string or a bigint, got number/],
      [{ x: BX.toString(), y: null }, /y must be a decimal string or a bigint, got null/],
    ];
    for (const [point, error] of badPoints) {
      expect(() => parseCurve25519Point(point)).toThrow(error);
    }

    const badScalars: Array<[unknown, RegExp]> = [
      [5, /decimal string or a bigint, got number/],
      [{ s: "1" }, /decimal string or a bigint, got object/],
      [true, /got boolean/],
      [undefined, /got undefined/],
      ["-3", /non-negative decimal integer string/],
      ["1e3", /non-negative decimal integer string/],
      [-3n, /must be non-negative/],
    ];
    for (const [scalar, error] of badScalars) {
      expect(() => parseCurve25519Scalar(scalar)).toThrow(error);
    }

    // The same refusals surface through parseCircuitArgs with the argument name.
    expect(() =>
      parseCircuitArgs(
        "mintFromSolana",
        mintArgs({ r: { x: BX.toString() }, s: S.toString() }),
        rawContractInfo,
      )
    ).toThrow(/argument "sig".*field "r".*missing field "y"/);
    expect(() =>
      parseCircuitArgs(
        "mintFromSolana",
        mintArgs({ r: { x: BX.toString(), y: BY.toString() } }),
        rawContractInfo,
      )
    ).toThrow(/Missing required field "s"/);
  });

  test("any other unknown type is still refused with the historical error", () => {
    for (const typeName of ["Curve25519Projective", "Vector", "Enum", ""]) {
      const info: ContractInfo = {
        circuits: [
          {
            name: "c",
            pure: false,
            arguments: [{ name: "a", type: { "type-name": typeName } }],
            "result-type": { "type-name": "Tuple", types: [] },
          },
        ],
        witnesses: [],
        contracts: [],
      };
      expect(() => parseCircuitArgs("c", ["1"], info)).toThrow(
        `Failed to parse argument "a" (index 0) for circuit "c": Unsupported type: ${typeName}`,
      );
    }
  });
});

describe("MidnightAdapter.validateInput with the raw 0.35.0 contract info (E8)", () => {
  function makeAdapter(): any {
    const adapter = Object.create(MidnightAdapter.prototype) as any;
    adapter.log = { log: () => {}, warn: () => {}, error: () => {} };
    adapter.contractInfo = rawContractInfo;
    adapter.walletSeeds = ["seed"];
    return adapter;
  }

  function makeInput(body: Record<string, unknown>): DefaultBatcherInput {
    return {
      addressType: 5,
      address: "relayer",
      timestamp: "1",
      input: JSON.stringify(body),
    } as DefaultBatcherInput;
  }

  test("accepts the relayer's mint input (with its recipient key mapping)", () => {
    const adapter = makeAdapter();
    const body = {
      circuit: "mintFromSolana",
      args: mintArgs(sigJson(BX.toString(), BY.toString(), S.toString())),
      coinEncPublicKeyMappings: [[CPK, EPK]],
    };
    expect(adapter.validateInput(makeInput(body))).toEqual({ valid: true });
  });

  test("refuses an out-of-range signature scalar before it is queued", () => {
    const adapter = makeAdapter();
    const body = {
      circuit: "mintFromSolana",
      args: mintArgs(sigJson(BX.toString(), BY.toString(), L.toString())),
      coinEncPublicKeyMappings: [[CPK, EPK]],
    };
    const result = adapter.validateInput(makeInput(body));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/argument "sig".*Curve25519Scalar must be < L/);
  });
});
