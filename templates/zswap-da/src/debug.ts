// Always-on debug logging for the take-offer / settle path. Every awaited step
// is wrapped so the console shows when it STARTS and when it finishes (with a
// duration), which makes a hang obvious: the `▶` line prints and the matching
// `✓` never does — that unmatched step is the one that stalled. Disable with
// `localStorage.ZS_DEBUG = '0'` in the browser console.

function enabled(): boolean {
  try {
    return localStorage.getItem("ZS_DEBUG") !== "0";
  } catch {
    return true;
  }
}

let seq = 0;

/** Plain checkpoint log. */
export function dlog(label: string, data?: unknown): void {
  if (!enabled()) return;
  if (data === undefined) console.log(`[zs] ${label}`);
  else console.log(`[zs] ${label}`, data);
}

/**
 * Wrap one awaited step. Logs `▶ #n label` before awaiting and
 * `✓ #n label (Nms)` / `✗ #n label (Nms)` after. A step that never resolves
 * (e.g. a wallet call waiting on a popup that never comes) leaves a `▶` with
 * no matching `✓` — that's your hang.
 */
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const id = ++seq;
  const t0 = performance.now();
  if (enabled()) console.log(`[zs] ▶ #${id} ${label}`);
  try {
    const out = await fn();
    const ms = (performance.now() - t0).toFixed(0);
    if (enabled()) console.log(`[zs] ✓ #${id} ${label} (${ms}ms)`);
    return out;
  } catch (e: any) {
    const ms = (performance.now() - t0).toFixed(0);
    console.error(`[zs] ✗ #${id} ${label} (${ms}ms)`, {
      name: e?.name,
      message: e?.message,
      raw: e,
    });
    throw e;
  }
}
