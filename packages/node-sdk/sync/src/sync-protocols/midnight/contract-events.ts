import type {
  MidnightContractEvent,
  MidnightContractEventType,
} from "./MidnightClient.ts";

export interface MidnightContractEventFilterConfig {
  contractAddress: string;
  eventType?: MidnightContractEventType;
  eventFieldFilters?: Readonly<Record<string, string>>;
}

export interface MidnightContractEventPayload {
  eventIdentity: string;
  eventId: number;
  maxEventId: number;
  eventVersion: number;
  protocolVersion: number;
  contractAddress: string;
  indexerTransactionId: number;
  transactionHash: string;
  blockHash: string;
  blockHeight: number;
  eventType: MidnightContractEventType;
  raw: string;
  /** Stable JSON object containing only the selected variant's typed fields. */
  fields: string;
}

const EVENT_FIELDS: Record<MidnightContractEventType, readonly string[]> = {
  ShieldedSpend: ["nullifier"],
  ShieldedReceive: ["commitment", "ciphertext", "receivingContractAddress"],
  ShieldedMint: ["commitment", "domainSep", "amount"],
  ShieldedBurn: ["nullifier", "amount"],
  UnshieldedSpend: ["sender", "senderKind", "domainSep", "tokenType", "amount"],
  UnshieldedReceive: ["recipient", "recipientKind", "domainSep", "tokenType", "amount"],
  UnshieldedMint: ["domainSep", "tokenType", "amount"],
  UnshieldedBurn: ["sender", "senderKind", "tokenType", "amount"],
  Paused: [],
  Unpaused: [],
  Misc: ["name", "payload"],
};

export function validateMidnightContractEventFilter(
  filter: MidnightContractEventFilterConfig,
): void {
  if (!/^(?:0x)?[0-9a-fA-F]{64}$/.test(filter.contractAddress ?? "")) {
    throw new Error("Midnight:ContractEvent requires one 32-byte contractAddress");
  }
  if (filter.eventType !== undefined && !(filter.eventType in EVENT_FIELDS)) {
    throw new Error(`Unsupported Midnight contract event type: ${String(filter.eventType)}`);
  }
  const fieldFilters = Object.entries(filter.eventFieldFilters ?? {});
  if (fieldFilters.length > 0 && filter.eventType === undefined) {
    throw new Error("Midnight contract event field filters require one concrete eventType");
  }
  if (filter.eventType !== undefined) {
    const allowed = new Set(EVENT_FIELDS[filter.eventType]);
    for (const [field, value] of fieldFilters) {
      if (!allowed.has(field)) {
        throw new Error(`Field ${field} is not valid for Midnight ${filter.eventType} events`);
      }
      if (typeof value !== "string") {
        throw new Error(`Midnight contract event field filter ${field} must be a string`);
      }
    }
  }
}

export function midnightContractEventIdentity(event: MidnightContractEvent): string {
  return JSON.stringify([
    event.protocolVersion,
    normalizeHex(event.contractAddress),
    event.blockHeight,
    normalizeHex(event.blockHash),
    normalizeHex(event.transactionHash),
    event.transactionId,
    event.id,
    event.version,
    event.eventType,
    event.raw,
  ]);
}

export function dedupeMidnightContractEvents(
  events: readonly MidnightContractEvent[],
): MidnightContractEvent[] {
  const identities = new Set<string>();
  return events.filter((event) => {
    const identity = midnightContractEventIdentity(event);
    if (identities.has(identity)) return false;
    identities.add(identity);
    return true;
  });
}

export function filterMidnightContractEvents(
  events: readonly MidnightContractEvent[],
  filter: MidnightContractEventFilterConfig,
): MidnightContractEvent[] {
  validateMidnightContractEventFilter(filter);
  const expectedAddress = normalizeHex(filter.contractAddress);
  return dedupeMidnightContractEvents(events).filter((event) => {
    if (normalizeHex(event.contractAddress) !== expectedAddress) return false;
    if (filter.eventType !== undefined && event.eventType !== filter.eventType) return false;
    const fields = midnightContractEventFields(event);
    return Object.entries(filter.eventFieldFilters ?? {}).every(
      ([field, value]) => fields[field] === value,
    );
  });
}

export function toMidnightContractEventPayload(
  event: MidnightContractEvent,
): MidnightContractEventPayload {
  return {
    eventIdentity: midnightContractEventIdentity(event),
    eventId: event.id,
    maxEventId: event.maxId,
    eventVersion: event.version,
    protocolVersion: event.protocolVersion,
    contractAddress: normalizeHex(event.contractAddress),
    indexerTransactionId: event.transactionId,
    transactionHash: normalizeHex(event.transactionHash),
    blockHash: normalizeHex(event.blockHash),
    blockHeight: event.blockHeight,
    eventType: event.eventType,
    raw: event.raw,
    fields: JSON.stringify(midnightContractEventFields(event)),
  };
}

export function midnightContractEventFields(
  event: MidnightContractEvent,
): Record<string, string> {
  switch (event.eventType) {
    case "ShieldedSpend":
      return { nullifier: event.nullifier };
    case "ShieldedReceive":
      return compactFields({
        commitment: event.commitment,
        ciphertext: event.ciphertext,
        receivingContractAddress: event.receivingContractAddress,
      });
    case "ShieldedMint":
      return compactFields({
        commitment: event.commitment,
        domainSep: event.domainSep,
        amount: event.amount,
      });
    case "ShieldedBurn":
      return compactFields({ nullifier: event.nullifier, amount: event.amount });
    case "UnshieldedSpend":
      return {
        sender: event.sender.value,
        senderKind: event.sender.kind,
        domainSep: event.domainSep,
        tokenType: event.tokenType,
        amount: event.amount,
      };
    case "UnshieldedReceive":
      return {
        recipient: event.recipient.value,
        recipientKind: event.recipient.kind,
        domainSep: event.domainSep,
        tokenType: event.tokenType,
        amount: event.amount,
      };
    case "UnshieldedMint":
      return { domainSep: event.domainSep, tokenType: event.tokenType, amount: event.amount };
    case "UnshieldedBurn":
      return {
        sender: event.sender.value,
        senderKind: event.sender.kind,
        tokenType: event.tokenType,
        amount: event.amount,
      };
    case "Paused":
    case "Unpaused":
      return {};
    case "Misc":
      return { name: event.name, payload: event.payload };
  }
}

export interface MidnightContractEventCursorSnapshot {
  lastAcceptedId?: number;
  accepted: readonly {
    identity: string;
    id: number;
    blockHeight: number;
  }[];
}

/**
 * Replay guard for an at-least-once contract-event stream. Snapshots are plain
 * JSON so callers can persist them. The indexer's `fromId` cursor is inclusive;
 * resumeFromId therefore advances by one after the last accepted event.
 */
export class MidnightContractEventCursor {
  private readonly accepted = new Map<
    string,
    { identity: string; id: number; blockHeight: number }
  >();
  private lastAcceptedId?: number;

  constructor(snapshot?: MidnightContractEventCursorSnapshot) {
    for (const item of snapshot?.accepted ?? []) this.accepted.set(item.identity, { ...item });
    this.lastAcceptedId = snapshot?.lastAcceptedId;
  }

  get resumeFromId(): number | undefined {
    return this.lastAcceptedId === undefined ? undefined : this.lastAcceptedId + 1;
  }

  accept(events: readonly MidnightContractEvent[]): MidnightContractEvent[] {
    const fresh: MidnightContractEvent[] = [];
    for (const event of events) {
      const identity = midnightContractEventIdentity(event);
      if (this.accepted.has(identity)) continue;
      this.accepted.set(identity, { identity, id: event.id, blockHeight: event.blockHeight });
      this.lastAcceptedId = Math.max(this.lastAcceptedId ?? event.id, event.id);
      fresh.push(event);
    }
    return fresh;
  }

  rewindFromBlock(blockHeight: number): void {
    for (const [identity, item] of this.accepted) {
      if (item.blockHeight >= blockHeight) this.accepted.delete(identity);
    }
    this.lastAcceptedId = undefined;
    for (const item of this.accepted.values()) {
      this.lastAcceptedId = Math.max(this.lastAcceptedId ?? item.id, item.id);
    }
  }

  snapshot(): MidnightContractEventCursorSnapshot {
    return {
      lastAcceptedId: this.lastAcceptedId,
      accepted: [...this.accepted.values()].sort(
        (left, right) => left.id - right.id || left.identity.localeCompare(right.identity),
      ),
    };
  }
}

function compactFields(
  fields: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

function normalizeHex(value: string): string {
  return value.replace(/^0x/, "").toLowerCase();
}
