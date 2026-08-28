import { NtpTimeSync } from "ntp-time-sync";

export type NtpTipClock = {
  getTime(): Promise<{ now: Date; offset: number }>;
};

export type GetNtpTipOptions = {
  startTime: number;
  blockTimeMS: number;
  servers?: readonly string[];
  /** Deterministic test seam; ordinary callers use the selected NTP network. */
  clock?: NtpTipClock;
};

export type NtpTip = { height: number; timestamp: number };

function validateOptions(options: GetNtpTipOptions): void {
  if (!Number.isFinite(options.startTime)) {
    throw new TypeError("NTP startTime must be finite");
  }
  if (!Number.isSafeInteger(options.blockTimeMS) || options.blockTimeMS <= 0) {
    throw new TypeError("NTP blockTimeMS must be a positive safe integer");
  }
}

/** Resolve one inclusive NTP page from the selected network clock. */
export async function getNtpTip(options: GetNtpTipOptions): Promise<NtpTip> {
  validateOptions(options);
  const clock = options.clock ?? (options.servers?.length
    ? new NtpTimeSync({ servers: [...options.servers] })
    : NtpTimeSync.getInstance());
  const result = await clock.getTime();
  const timestamp = result.now.getTime();
  if (!Number.isFinite(timestamp)) {
    throw new TypeError("NTP clock returned an invalid timestamp");
  }
  const height = Math.floor(
    (timestamp - options.startTime) / options.blockTimeMS,
  );
  if (!Number.isSafeInteger(height) || height < 0) {
    throw new RangeError("NTP clock resolved an invalid block height");
  }
  return { height, timestamp };
}
