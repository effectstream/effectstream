// Lightweight in-app debug log. Buffers timestamped lines in memory, mirrors to
// the browser console, and (once installed) also captures console.error/warn so
// third-party failures (Lace / midnight-js proof errors) land in the same place.
//
// Copy it from the console dock's "Copy log" button, or from the devtools
// console via `zlog.dump()` / `zlog.copy()`.

interface Line { t: string; level: string; msg: string }

const BUF: Line[] = [];
const MAX = 800;

function stamp(): string {
  // HH:MM:SS.mmm — argless new Date() is fine in app code (only workflow scripts forbid it).
  return new Date().toISOString().slice(11, 23);
}

function fmt(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.name}: ${a.message}${a.stack ? `\n${a.stack}` : ''}`;
      if (typeof a === 'object' && a !== null) {
        try { return JSON.stringify(a, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v)); } catch { return String(a); }
      }
      return String(a);
    })
    .join(' ');
}

function push(level: string, args: unknown[]): void {
  BUF.push({ t: stamp(), level, msg: fmt(args) });
  if (BUF.length > MAX) BUF.shift();
}

export const log = {
  info: (...a: unknown[]) => { push('INFO', a); console.info(...a); },
  warn: (...a: unknown[]) => { push('WARN', a); console.warn(...a); },
  error: (...a: unknown[]) => { push('ERROR', a); console.error(...a); },
  /** Full buffer as plain text, ready to paste. */
  dump: () => BUF.map((l) => `${l.t} ${l.level}  ${l.msg}`).join('\n'),
  clear: () => { BUF.length = 0; },
  /** Copy the buffer to the clipboard; resolves false if the API is unavailable. */
  copy: async (): Promise<boolean> => {
    try { await navigator.clipboard.writeText(log.dump()); return true; } catch { return false; }
  },
};

let captured = false;
/** Mirror console.error/warn into the buffer so external errors are captured too. */
export function installConsoleCapture(): void {
  if (captured) return;
  captured = true;
  (['error', 'warn'] as const).forEach((level) => {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => { push(level.toUpperCase(), args); orig(...args); };
  });
  (globalThis as unknown as { zlog?: typeof log }).zlog = log;
  log.info('[log] capture installed —', navigator.userAgent);
}
