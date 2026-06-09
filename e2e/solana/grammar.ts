import type { Grammar } from "@effectstream/sm";

export const grammar = {
  "solana-program-log": {
    type: "event" as const,
    parser: (data: any) => {
      return {
        slot: data.slot ?? data.payload?.slot ?? 0,
        programId: data.programId ?? data.payload?.programId ?? "",
        logMessages: data.logMessages ?? data.payload?.logMessages ?? [],
      };
    },
  },
} satisfies Grammar;
