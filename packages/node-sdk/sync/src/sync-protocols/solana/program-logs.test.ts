import { expect, test } from "bun:test";
import { extractProgramLogs } from "./program-logs.ts";

const WATCHED = "Watch1111111111111111111111111111111111111";
const OTHER = "0ther1111111111111111111111111111111111111";
const SYSTEM = "11111111111111111111111111111111";

test("returns null when the program never appears at all", () => {
  expect(extractProgramLogs([
    `Program ${OTHER} invoke [1]`,
    "Program log: unrelated",
    `Program ${OTHER} success`,
  ], WATCHED)).toBeNull();
});

test("SPOOF: a program merely named in another program's log line is not invoked", () => {
  // The attack the old `accountKeys.includes()` + substring match allowed: the
  // watched program is referenced as a bare account key (so it shows up in
  // accountKeys) while someone else's program emits the expected text.
  const logs = [
    `Program ${OTHER} invoke [1]`,
    `Program log: ${WATCHED} EFFECTSTREAM_COUNTER|attacker|9999|1`,
    `Program ${OTHER} success`,
  ];
  expect(extractProgramLogs(logs, WATCHED)).toBeNull();
});

test("collects only the watched program's own lines at top level", () => {
  expect(extractProgramLogs([
    `Program ${WATCHED} invoke [1]`,
    "Program log: mine",
    `Program ${WATCHED} consumed 1234 of 200000 compute units`,
    `Program ${WATCHED} success`,
  ], WATCHED)).toEqual(["Program log: mine"]);
});

test("CPI: an inner program's lines are not attributed to the outer one", () => {
  const logs = [
    `Program ${WATCHED} invoke [1]`,
    "Program log: outer before",
    `Program ${OTHER} invoke [2]`,
    "Program log: inner",
    `Program ${OTHER} consumed 10 of 100 compute units`,
    `Program ${OTHER} success`,
    "Program log: outer after",
    `Program ${WATCHED} consumed 50 of 200 compute units`,
    `Program ${WATCHED} success`,
  ];
  expect(extractProgramLogs(logs, WATCHED))
    .toEqual(["Program log: outer before", "Program log: outer after"]);
  expect(extractProgramLogs(logs, OTHER)).toEqual(["Program log: inner"]);
});

test("CPI: a watched program called by another still reports its own lines", () => {
  expect(extractProgramLogs([
    `Program ${OTHER} invoke [1]`,
    "Program log: caller",
    `Program ${WATCHED} invoke [2]`,
    "Program log: callee",
    `Program ${WATCHED} success`,
    `Program ${OTHER} success`,
  ], WATCHED)).toEqual(["Program log: callee"]);
});

test("invoked-but-silent yields [] — distinct from null", () => {
  // The System Program logs only its framing; the primitive should still fire.
  const result = extractProgramLogs([
    `Program ${SYSTEM} invoke [1]`,
    `Program ${SYSTEM} success`,
  ], SYSTEM);
  expect(result).not.toBeNull();
  expect(result).toEqual([]);
});

test("multiple invocations of the same program accumulate", () => {
  expect(extractProgramLogs([
    `Program ${WATCHED} invoke [1]`,
    "Program log: first",
    `Program ${WATCHED} success`,
    `Program ${WATCHED} invoke [1]`,
    "Program log: second",
    `Program ${WATCHED} success`,
  ], WATCHED)).toEqual(["Program log: first", "Program log: second"]);
});

test("a failed inner frame still pops", () => {
  expect(extractProgramLogs([
    `Program ${WATCHED} invoke [1]`,
    `Program ${OTHER} invoke [2]`,
    "Program log: inner",
    `Program ${OTHER} failed: custom program error: 0x1`,
    "Program log: outer recovers",
    `Program ${WATCHED} success`,
  ], WATCHED)).toEqual(["Program log: outer recovers"]);
});

test("truncated logs leaving an unbalanced stack don't throw", () => {
  expect(() => extractProgramLogs([
    `Program ${WATCHED} success`,
    `Program ${WATCHED} invoke [1]`,
    "Program log: mine",
    "Log truncated",
  ], WATCHED)).not.toThrow();
});

test("Program data and return lines are kept as content", () => {
  expect(extractProgramLogs([
    `Program ${WATCHED} invoke [1]`,
    "Program data: SGVsbG8=",
    `Program return: ${WATCHED} AQID`,
    `Program ${WATCHED} success`,
  ], WATCHED)).toEqual(["Program data: SGVsbG8=", `Program return: ${WATCHED} AQID`]);
});
