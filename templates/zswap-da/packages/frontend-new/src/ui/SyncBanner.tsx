import { useEffect, useState } from 'react';
import { API_BASE } from '../config';

interface HealthSync {
  status: 'ok' | 'syncing' | 'error';
  ntp: { pct: number; lag_seconds: number };
}

export function SyncBanner() {
  const [health, setHealth] = useState<HealthSync | null>(null);

  useEffect(() => {
    let dead = false;
    let timer: ReturnType<typeof setTimeout>;

    async function check() {
      if (dead) return;
      try {
        const r = await fetch(`${API_BASE}/api/health/sync`);
        if (dead) return;
        if (r.ok) {
          const data: HealthSync = await r.json();
          if (dead) return;
          setHealth(data);
          // Only schedule another check when not yet OK
          if (data.status !== 'ok') timer = setTimeout(check, 60_000);
        } else {
          timer = setTimeout(check, 60_000);
        }
      } catch {
        if (!dead) timer = setTimeout(check, 60_000);
      }
    }

    check();
    return () => { dead = true; clearTimeout(timer); };
  }, []);

  if (!health || health.status === 'ok') return null;

  const isError = health.status === 'error';
  const lagH    = Math.round((health.ntp?.lag_seconds ?? 0) / 3600);
  const pct     = health.ntp?.pct ?? 0;

  return (
    <div style={{
      background: isError ? 'rgba(139,32,32,0.18)' : 'rgba(140,110,0,0.15)',
      borderBottom: `1px solid ${isError ? 'rgba(220,80,80,0.35)' : 'rgba(210,165,40,0.35)'}`,
      padding: '9px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      fontSize: 13,
      color: isError ? '#E88080' : '#D4A830',
      fontFamily: 'var(--font-ui)',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: isError ? '#E06060' : '#D4A830', flex: '0 0 auto' }} />
      {isError
        ? 'Indexer error — no blocks finalized. The service may be starting up or recovering.'
        : <span>
            <strong>Syncing</strong> — {pct.toFixed(1)}% complete
            {lagH > 1 ? `, ~${lagH}h remaining` : ''}.
            {' '}Live offers will appear once the node catches up.
          </span>
      }
    </div>
  );
}
