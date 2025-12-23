import mqtt from "mqtt";
import { WebSocket as NodeWebSocket } from "ws";
import { AddressType } from "@effectstream/utils";
import { assert, type SharedState } from "@e2e/engine";

const BATCHER_URL = "http://localhost:3334";
const MQTT_WS_URL = "ws://localhost:8833";
const MQTT_TIMEOUT_MS = 60_000;
const DEFAULT_MINT_AMOUNT = 20_000;

interface BatcherResponse {
  success: boolean;
  message: string;
  inputId: string;
}

interface InputUpdatePayload {
  inputId: string;
  target: string;
  phase:
    | "accepted"
    | "submitted"
    | "receipt"
    | "effectstream-processed"
    | "error";
  txHash?: string;
  blockNumber?: number;
  rollup?: number;
  error?: string;
  time: number;
}

const MINT_ACCOUNT = {
  is_left: true,
  left: {
    bytes: "0x00112233445566778899AABBCCDDEEFF00112233445566778899AABBCCDDEEFF",
  },
  right: {
    bytes: "0x0000000000000000000000000000000000000000000000000000000000000000",
  },
};

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as { WebSocket: typeof NodeWebSocket }).WebSocket =
    NodeWebSocket;
}

async function submitMintInput(
  amount: number,
): Promise<BatcherResponse> {
  const input = JSON.stringify({
    circuit: "mint",
    args: [MINT_ACCOUNT, amount],
  });
  const body = {
    data: {
      target: "midnight_eip20",
      address: "placeholderaddress",
      addressType: AddressType.MIDNIGHT,
      input,
      timestamp: Date.now(),
    },
    confirmationLevel: "no-wait" as const,
  };

  const response = await fetch(`${BATCHER_URL}/send-input`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(
      `[MQTT TEST] Failed to submit mint input: ${response.status} ${JSON.stringify(json)}`,
    );
  }
  return json as BatcherResponse;
}

async function waitForMqttPhase(
  topic: string,
  desiredPhase: InputUpdatePayload["phase"],
  timeoutMs: number = MQTT_TIMEOUT_MS,
): Promise<InputUpdatePayload> {
  return await new Promise((resolve, reject) => {
    const client = mqtt.connect(MQTT_WS_URL, {
      protocolVersion: 4,
      reconnectPeriod: 0,
    });

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      client.end(true, () =>
        reject(
          new Error(
            `[MQTT TEST] Timeout waiting for ${desiredPhase} on topic ${topic}`,
          ),
        )
      );
    }, timeoutMs);

    const finalize = (err?: Error, payload?: InputUpdatePayload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      client.end(true, () => {
        if (err) reject(err);
        else resolve(payload!);
      });
    };

    client.on("connect", () => {
      client.subscribe(topic, (error) => {
        if (error) {
          finalize(
            new Error(
              `[MQTT TEST] Failed to subscribe to ${topic}: ${error.message}`,
            ),
          );
        }
      });
    });

    client.on("message", (incomingTopic, payload) => {
      if (incomingTopic !== topic) return;
      let parsed: InputUpdatePayload;
      try {
        parsed = JSON.parse(payload.toString());
      } catch (error) {
        finalize(
          new Error(
            `[MQTT TEST] Unable to parse payload for ${topic}: ${
              (error as Error).message
            }`,
          ),
        );
        return;
      }
      if (parsed.phase === desiredPhase) {
        finalize(undefined, parsed);
      }
    });

    client.on("error", (error) => {
      finalize(
        new Error(`[MQTT TEST] MQTT client error: ${error.message}`),
      );
    });
  });
}

export async function testMqttSubscription(
  _sharedState: SharedState,
): Promise<void> {
  const { inputId } = await submitMintInput(DEFAULT_MINT_AMOUNT);
  const topic = `batcher/inputs/${inputId}`;

  await assert("MQTT mint effectstream update", async () => {
    const update = await waitForMqttPhase(topic, "effectstream-processed");
    return update.inputId === inputId &&
      update.phase === "effectstream-processed";
  });
}

