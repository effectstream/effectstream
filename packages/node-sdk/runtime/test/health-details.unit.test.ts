/**
 * `/health` carries each protocol's own details (AA 00064 C9, spec FR-006):
 * e.g. the Solana sync's mode and RPC calls per method. The response schema
 * must name the field, or Fastify's serializer silently drops it.
 */
import { expect, test } from "bun:test";
import fastify from "fastify";
import type { AllSyncProtocols } from "@effectstream/sync";
import { buildHealthReport, HealthResponseSchema } from "../src/api/health.ts";

function protocol(name: string, details?: Record<string, unknown>) {
  return {
    name,
    lastPollAtMs: 0,
    lastSuccessfulFetchMs: 0,
    lastProducerErrorMs: 0,
    pollingIntervalMs: 6000,
    consecutiveErrors: 0,
    producerRestarts: 0,
    producerErrors: 0,
    lastPage: { own: 10, ownBlockNumber: 10, root: 1 },
    mergeWaitingForPage: false,
    bufferedData: { size: () => 0 },
    bufferCap: 40,
    pausedNow: false,
    healthDetails: () => details,
  } as unknown as AllSyncProtocols;
}

const solanaDetails = {
  mode: "program",
  rpcCalls: { getSlot: 3, getBlockTime: 3, getSignaturesForAddress: 3 },
  rpcCallsTotal: 9,
  pollIntervalMs: 6000,
  progress: { slot: 508111900, blockTime: 1791294238, blockTimeSlot: 508111900 },
  cursor: { slot: 508111848, signatures: ["3AWD"] },
};

test("a protocol's healthDetails() appear as protocols[].details; none, no field", () => {
  const report = buildHealthReport([protocol("mainNtp"), protocol("parallelSolana", solanaDetails)], 60_000);
  expect(report.protocols[0]).not.toHaveProperty("details");
  expect(report.protocols[1].details).toEqual(solanaDetails);
});

test("the /health response schema keeps details through Fastify's serializer", async () => {
  const server = fastify();
  server.get("/health", { schema: { response: { 200: HealthResponseSchema, 503: HealthResponseSchema } } }, (_req, reply) => {
    const report = buildHealthReport([protocol("mainNtp"), protocol("parallelSolana", solanaDetails)], 60_000);
    return reply.status(200).send(report);
  });
  const res = await server.inject({ method: "GET", url: "/health" });
  const body = res.json() as { protocols: { name: string; details?: unknown }[] };
  expect(body.protocols.find((p) => p.name === "parallelSolana")!.details).toEqual(solanaDetails);
  expect(body.protocols.find((p) => p.name === "mainNtp")!.details).toBeUndefined();
  await server.close();
});
