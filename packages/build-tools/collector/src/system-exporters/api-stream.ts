import type { Namespace, SeverityNumber } from "@paima/log";
import { fastify, type FastifyInstance } from "fastify";

//
// This API exposes the latest 1000 otel logs using.
//
// Each time it's read, it clears the data store.
// This is used by the TUI to display the latest logs.
//
const MAX_DATA_ITEMS = 1000;

export interface TsLogExported {
  "0": string;
  _meta: Meta;
}

export interface Meta {
  runtime: string;
  runtimeVersion: string;
  hostname: string;
  date: Date;
  logLevelId: number;
  logLevelName: string;
  path: Path;
}

export interface Path {
  fullFilePath: string;
  fileName: string;
  fileNameWithLine: string;
  fileColumn: string;
  fileLine: string;
  filePath: string;
  filePathWithLine: string;
}

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

const dataStore = new RingBuffer<TsLogExported>(MAX_DATA_ITEMS);

export function exportToApiStream(item: TsLogExported) {
  dataStore.push(item);
}

function getData() {
  const copy = dataStore.toArray();
  dataStore.clear();
  return copy;
}

const PORT = Deno.env.get("COLLECTOR_LOG_PORT")
  ? Number(Deno.env.get("COLLECTOR_LOG_PORT"))
  : 11033;

const server = fastify();

server.get("/v1/data", async (request: any, reply: any) => {
  const copy = getData();
  reply.status(200).send(copy);
});

try {
  await server.listen({ port: PORT });
} catch (err) {
  server.log.error(err);
  Deno.exit(1);
}
