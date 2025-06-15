import { fastify, type FastifyRequest } from "fastify";
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { API_LOG_URL } from "./config.ts";

//
// This API exposes the latest 1000 otel logs using.
//
// Each time it's read, it clears the data store.
// This is used by the TUI to display the latest logs.
//
const MAX_DATA_ITEMS = 1000;

export const OTelLogSchema = Type.Object({
  component: Type.String(),
  namespace: Type.Union([Type.String(), Type.Array(Type.String())]),
  level: Type.Number(),
  message: Type.Array(Type.String()),
});
export type OTelLog = Static<typeof OTelLogSchema>;
//
// Ring buffer implementation for storing the latest logs
// This provides O(1) insertion and maintains a fixed size efficiently
//
class RingBuffer<T> {
  private buffer: T[];
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;

    if (this.size < this.capacity) {
      this.size++;
    } else {
      // Buffer is full, move head forward (overwrite oldest)
      this.head = (this.head + 1) % this.capacity;
    }
  }

  toArray(): T[] {
    if (this.size === 0) return [];

    const result: T[] = [];
    let current = this.head;

    for (let i = 0; i < this.size; i++) {
      result.push(this.buffer[current]);
      current = (current + 1) % this.capacity;
    }

    return result;
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }

  getSize(): number {
    return this.size;
  }
}

class LogServer {
  private dataStore = new RingBuffer<OTelLog>(MAX_DATA_ITEMS);
  public port = Deno.env.get("COLLECTOR_LOG_PORT")
    ? Number(Deno.env.get("COLLECTOR_LOG_PORT"))
    : 11033;
  private server = fastify();

  private getData() {
    const copy = this.dataStore.toArray();
    this.dataStore.clear();
    return copy;
  }

  public async init() {
    this.server.post("/v1/data", {
      schema: {
        body: OTelLogSchema,
      },
    }, (request: FastifyRequest<{ Body: OTelLog }>, reply) => {
      try {
        this.dataStore.push(request.body);
        reply.status(200).send({ success: true });
      } catch (error) {
        reply.status(500).send({ error: "Failed to store log data" });
      }
    });

    this.server.get("/v1/data", (request: any, reply: any) => {
      const copy = this.getData();
      reply.status(200).send(copy);
    });

    await this.server.listen({ port: this.port });
  }
}

export async function startServer() {
  const server = new LogServer();
  try {
    await server.init();
    console.log(`🔍 Starting logs server on port ${server.port}`);
  } catch (err) {
    console.log(`❌ Failed to start logs server on port ${server.port}`);
    console.error(err);
    Deno.exit(1);
  }
}

export async function fetchLogs(): Promise<OTelLog[]> {
  try {
    const response = await fetch(API_LOG_URL + "/v1/data");
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    return Value.Parse(Type.Array(OTelLogSchema), data);
  } catch (error) {
    console.error(
      `Failed to fetch logs: ${error instanceof Error ? error.message : error}`,
    );
    return [];
  }
}
