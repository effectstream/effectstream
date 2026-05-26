export function decodeAssetName(hex: string): string {
  try {
    const bytes = new Uint8Array(
      hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
    );
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (/^[\x20-\x7e]+$/.test(text)) return text;
    return hex;
  } catch {
    return hex;
  }
}

export function truncateAddress(addr: string, start = 12, end = 6): string {
  if (addr.length <= start + end + 3) return addr;
  return `${addr.slice(0, start)}...${addr.slice(-end)}`;
}

export function truncateHash(hash: string, len = 16): string {
  if (hash.length <= len + 3) return hash;
  return `${hash.slice(0, len)}...`;
}

export function formatTimestamp(posixMs: string | number): string {
  const ms = typeof posixMs === "string" ? parseInt(posixMs, 10) : posixMs;
  if (isNaN(ms)) return String(posixMs);
  const date = new Date(ms);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function relativeTime(posixMs: string | number): string {
  const ms = typeof posixMs === "string" ? parseInt(posixMs, 10) : posixMs;
  if (isNaN(ms)) return "";
  const diff = ms - Date.now();
  const absDiff = Math.abs(diff);
  const past = diff < 0;

  if (absDiff < 60_000) return past ? "just now" : "in < 1 min";
  if (absDiff < 3_600_000) {
    const mins = Math.floor(absDiff / 60_000);
    return past ? `${mins}m ago` : `in ${mins}m`;
  }
  if (absDiff < 86_400_000) {
    const hrs = Math.floor(absDiff / 3_600_000);
    return past ? `${hrs}h ago` : `in ${hrs}h`;
  }
  const days = Math.floor(absDiff / 86_400_000);
  return past ? `${days}d ago` : `in ${days}d`;
}

export function toHex(s: string): string {
  return Array.from(new TextEncoder().encode(s))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function lovelaceToAda(lovelace: string | number): string {
  const n = typeof lovelace === "string" ? Number(lovelace) : lovelace;
  return (n / 1_000_000).toFixed(2);
}

export function statusLabel(status: string): { label: string; color: string; bg: string } {
  switch (status) {
    case "Lock":
      return { label: "Locked at Script", color: "#22c55e", bg: "rgba(34,197,94,0.12)" };
    case "Unlocking":
      return { label: "Withdrawal Requested", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" };
    case "Claim":
      return { label: "Claimed / Returned", color: "#64748b", bg: "rgba(100,116,139,0.12)" };
    default:
      return { label: status, color: "#94a3b8", bg: "rgba(148,163,184,0.1)" };
  }
}
