import { fastify, type FastifyRequest } from "fastify";
import { type Static, Type } from "@sinclair/typebox";
import { ENV } from "@paima/utils";
import { RingBuffer } from "./tab/logs-ringbuffer.ts";

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

// Schema for log display control
const LogDisplayControlSchema = Type.Object({
  processName: Type.String(),
  enabled: Type.Boolean(),
});
type LogDisplayControl = Static<typeof LogDisplayControlSchema>;

export class LogServer {
  private dataStore = new RingBuffer<OTelLog>(MAX_DATA_ITEMS);
  private processLogStates: Record<string, boolean> = {}; // Track per-process log display state

  public readonly port: number = ENV.TUI_LOG_PORT;
  private server = fastify();

  public getData() {
    const copy = this.dataStore.toArray();
    this.dataStore.clear();
    return copy;
  }

  // Check if logs should be displayed for a specific process
  public isLogDisplayEnabled(processName: string): boolean {
    // Default to enabled if not explicitly set
    return this.processLogStates[processName] ?? true;
  }

  // Set log display state
  private setLogDisplayEnabled(
    processName: string,
    enabled: boolean,
  ): void {
    this.processLogStates[processName] = enabled;
  }

  // Get all log display states
  getAllLogDisplayStates(): Record<string, boolean> {
    return this.processLogStates;
  }

  // Add logs to buffer
  private addLogs(logs: OTelLog[]): void {
    for (const log of logs) {
      this.dataStore.push(log);
    }
  }

  public async init() {
    this.server.post("/v1/data", {
      schema: {
        body: Type.Array(OTelLogSchema),
      },
    }, (request: FastifyRequest<{ Body: OTelLog[] }>, reply) => {
      try {
        this.addLogs(request.body);
        reply.status(200).send({ success: true });
      } catch (error) {
        reply.status(500).send({ error: "Failed to store log data" });
      }
    });

    this.server.get("/v1/data", (request: any, reply: any) => {
      const copy = this.getData();
      reply.status(200).send(copy);
    });

    // New endpoint to control log display per process
    this.server.post("/v1/display-control", {
      schema: {
        body: LogDisplayControlSchema,
      },
    }, (request: FastifyRequest<{ Body: LogDisplayControl }>, reply) => {
      try {
        this.setLogDisplayEnabled(
          request.body.processName,
          request.body.enabled,
        );
        reply.status(200).send({
          success: true,
          processName: request.body.processName,
          enabled: request.body.enabled,
        });
      } catch (error) {
        reply.status(500).send({ error: "Failed to update display control" });
      }
    });

    // New endpoint to get current display state for all processes
    this.server.get("/v1/display-control", (request: any, reply: any) => {
      reply.status(200).send(this.getAllLogDisplayStates());
    });

    // New endpoint to get display state for a specific process
    this.server.get(
      "/v1/display-control/:processName",
      (request: any, reply: any) => {
        const processName = request.params.processName;
        const enabled = this.isLogDisplayEnabled(processName);
        reply.status(200).send({ processName, enabled });
      },
    );

    await this.server.listen({ port: this.port });
  }
}
