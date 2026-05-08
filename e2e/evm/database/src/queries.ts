import { PreparedQuery } from "@pgtyped/runtime";

// ── game_results ─────────────────────────────────────────────────────────────

export interface IInsertGameResultParams { block_height: number; a: number; b: number; result: number; }
const insertGameResultIR: any = {
  usedParamSet: { a: true, b: true, result: true, block_height: true },
  params: [
    { name: "a", required: true, transform: { type: "scalar" }, locs: [{ a: 62, b: 65 }] },
    { name: "b", required: true, transform: { type: "scalar" }, locs: [{ a: 67, b: 70 }] },
    { name: "result", required: true, transform: { type: "scalar" }, locs: [{ a: 72, b: 80 }] },
    { name: "block_height", required: true, transform: { type: "scalar" }, locs: [{ a: 82, b: 96 }] },
  ],
  statement: "INSERT INTO game_results\n(a, b, result, block_height)\nVALUES\n(:a!, :b!, :result!, :block_height!)",
};
export const insertGameResult = new PreparedQuery<IInsertGameResultParams, void>(insertGameResultIR);

// ── erc20_transfers ──────────────────────────────────────────────────────────

export interface IInsertErc20TransferParams { block_height: number; from_addr: string; to_addr: string; value: string; }
const insertErc20TransferIR: any = {
  usedParamSet: { from_addr: true, to_addr: true, value: true, block_height: true },
  params: [
    { name: "from_addr", required: true, transform: { type: "scalar" }, locs: [{ a: 78, b: 89 }] },
    { name: "to_addr", required: true, transform: { type: "scalar" }, locs: [{ a: 91, b: 100 }] },
    { name: "value", required: true, transform: { type: "scalar" }, locs: [{ a: 102, b: 109 }] },
    { name: "block_height", required: true, transform: { type: "scalar" }, locs: [{ a: 111, b: 125 }] },
  ],
  statement: "INSERT INTO erc20_transfers\n(from_addr, to_addr, value, block_height)\nVALUES\n(:from_addr!, :to_addr!, :value!, :block_height!)",
};
export const insertErc20Transfer = new PreparedQuery<IInsertErc20TransferParams, void>(insertErc20TransferIR);

// ── erc721_transfers ─────────────────────────────────────────────────────────

export interface IInsertErc721TransferParams { block_height: number; from_addr: string; to_addr: string; token_id: string; }
const insertErc721TransferIR: any = {
  usedParamSet: { from_addr: true, to_addr: true, token_id: true, block_height: true },
  params: [
    { name: "from_addr", required: true, transform: { type: "scalar" }, locs: [{ a: 82, b: 93 }] },
    { name: "to_addr", required: true, transform: { type: "scalar" }, locs: [{ a: 95, b: 104 }] },
    { name: "token_id", required: true, transform: { type: "scalar" }, locs: [{ a: 106, b: 116 }] },
    { name: "block_height", required: true, transform: { type: "scalar" }, locs: [{ a: 118, b: 132 }] },
  ],
  statement: "INSERT INTO erc721_transfers\n(from_addr, to_addr, token_id, block_height)\nVALUES\n(:from_addr!, :to_addr!, :token_id!, :block_height!)",
};
export const insertErc721Transfer = new PreparedQuery<IInsertErc721TransferParams, void>(insertErc721TransferIR);

// ── erc1155_transfers ────────────────────────────────────────────────────────

export interface IInsertErc1155TransferParams { block_height: number; from_addr: string; to_addr: string; token_id: string; amount: string; }
const insertErc1155TransferIR: any = {
  usedParamSet: { from_addr: true, to_addr: true, token_id: true, amount: true, block_height: true },
  params: [
    { name: "from_addr", required: true, transform: { type: "scalar" }, locs: [{ a: 91, b: 102 }] },
    { name: "to_addr", required: true, transform: { type: "scalar" }, locs: [{ a: 104, b: 113 }] },
    { name: "token_id", required: true, transform: { type: "scalar" }, locs: [{ a: 115, b: 125 }] },
    { name: "amount", required: true, transform: { type: "scalar" }, locs: [{ a: 127, b: 135 }] },
    { name: "block_height", required: true, transform: { type: "scalar" }, locs: [{ a: 137, b: 151 }] },
  ],
  statement: "INSERT INTO erc1155_transfers\n(from_addr, to_addr, token_id, amount, block_height)\nVALUES\n(:from_addr!, :to_addr!, :token_id!, :amount!, :block_height!)",
};
export const insertErc1155Transfer = new PreparedQuery<IInsertErc1155TransferParams, void>(insertErc1155TransferIR);

// ── counter_results ──────────────────────────────────────────────────────────

export interface IInsertCounterResultParams { block_height: number; counter_value: number; }
const insertCounterResultIR: any = {
  usedParamSet: { counter_value: true, block_height: true },
  params: [
    { name: "counter_value", required: true, transform: { type: "scalar" }, locs: [{ a: 66, b: 81 }] },
    { name: "block_height", required: true, transform: { type: "scalar" }, locs: [{ a: 83, b: 97 }] },
  ],
  statement: "INSERT INTO counter_results\n(counter_value, block_height)\nVALUES\n(:counter_value!, :block_height!)",
};
export const insertCounterResult = new PreparedQuery<IInsertCounterResultParams, void>(insertCounterResultIR);
