// Footer — the slim black bar pinned under the console dock.
// Open-source CTA on the left ("Launch your own DEX · fully open source"),
// GitHub fork button + live star count on the right.

import { useEffect, useState } from 'react';
import { Mark } from './icons';

const REPO = 'effectstream/effectstream';
const REPO_URL = 'https://github.com/effectstream/effectstream/tree/v-next/templates/zswap-da';

function GhStars() {
  const [stars, setStars] = useState<number | null | false>(null); // null = loading, false = unavailable
  useEffect(() => {
    let live = true;
    fetch('https://api.github.com/repos/' + REPO)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => { if (live) setStars(typeof d.stargazers_count === 'number' ? d.stargazers_count : false); })
      .catch(() => { if (live) setStars(false); });
    return () => { live = false; };
  }, []);
  const label = stars === null ? '—' : stars === false ? 'Star' : stars >= 1000 ? (stars / 1000).toFixed(1) + 'k' : String(stars);
  return (
    <a href={REPO_URL} target="_blank" rel="noopener noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 13px', borderRadius: 'var(--r-pill)', background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.16)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 13.5 }}>
      <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 014 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="#F5B400" aria-hidden="true"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" /></svg>
      <span className="zs-num">{label}</span>
    </a>
  );
}

export function Footer() {
  return (
    <footer style={{ background: 'var(--ink)', color: '#fff' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
            <Mark size={18} color="#fff" /><span style={{ fontWeight: 800, fontSize: 14, letterSpacing: '-.02em' }}>zswap</span>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'rgba(255,255,255,.72)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--pos)', flex: '0 0 auto' }} />
            <span><b style={{ color: '#fff', fontWeight: 700 }}>Launch your own DEX</b> · fully open source</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="zs-btn zs-btn--primary" style={{ textDecoration: 'none', padding: '8px 14px', fontSize: 13.5 }}>
            <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 014 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
            Fork the template
          </a>
          <GhStars />
        </div>
      </div>
    </footer>
  );
}
