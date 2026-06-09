import {useEffect, useState, type ReactNode} from 'react';
import styles from './styles.module.css';

interface GameRailProps {
  slug: string;
  leaderboardUrl?: string;
  achievementsUrl?: string;
}

interface LeaderboardEntry {
  rank: number;
  address: string;
  displayName: string;
  score: number;
}

interface LeaderboardResponse {
  totalPlayers: number;
  totalScore: number;
  entries: LeaderboardEntry[];
}

interface Achievement {
  name: string;
  displayName: string;
  description: string;
  isActive: boolean;
  iconURI: string;
  percentCompleted: number;
}

interface AchievementsResponse {
  achievements: Achievement[];
}

type FetchState<T> =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'error'; message: string}
  | {status: 'ok'; data: T};

function useJson<T>(url: string | undefined): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>(
    url ? {status: 'loading'} : {status: 'idle'},
  );
  useEffect(() => {
    if (!url) {
      setState({status: 'idle'});
      return;
    }
    let cancelled = false;
    setState({status: 'loading'});
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<T>;
      })
      .then((data) => {
        if (!cancelled) setState({status: 'ok', data});
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: err instanceof Error ? err.message : 'fetch failed',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state;
}

function shortenAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function Panel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactNode {
  return (
    <section className={styles.panel}>
      <div className={styles.label}>◇ {label}</div>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

function PanelStatus({text}: {text: string}): ReactNode {
  return <div className={styles.status}>{text}</div>;
}

function LeaderboardPanel({url}: {url?: string}): ReactNode {
  const state = useJson<LeaderboardResponse>(url);
  return (
    <Panel label="Standings">
      {!url && <PanelStatus text="— no source configured" />}
      {state.status === 'loading' && <PanelStatus text="loading…" />}
      {state.status === 'error' && (
        <PanelStatus text={`error: ${state.message}`} />
      )}
      {state.status === 'ok' && (
        <ol className={styles.list}>
          {state.data.entries.slice(0, 10).map((e) => (
            <li key={e.rank} className={styles.row}>
              <span className={styles.rank}>{String(e.rank).padStart(2, '0')}</span>
              <span className={styles.player} title={e.address}>
                {shortenAddress(e.displayName || e.address)}
              </span>
              <span className={styles.score}>{e.score.toLocaleString()}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function AchievementsPanel({url}: {url?: string}): ReactNode {
  const state = useJson<AchievementsResponse>(url);
  return (
    <Panel label="Honors">
      {!url && <PanelStatus text="— no source configured" />}
      {state.status === 'loading' && <PanelStatus text="loading…" />}
      {state.status === 'error' && (
        <PanelStatus text={`error: ${state.message}`} />
      )}
      {state.status === 'ok' && (
        <ul className={styles.list}>
          {state.data.achievements
            .filter((a) => a.isActive)
            .sort((a, b) => b.percentCompleted - a.percentCompleted)
            .map((a) => (
              <li key={a.name} className={styles.achievement} title={a.description}>
                <span className={styles.glyph}>
                  {a.percentCompleted > 0 ? '◆' : '◇'}
                </span>
                <span className={styles.achievementName}>{a.displayName}</span>
                <span className={styles.percent}>
                  {a.percentCompleted.toFixed(a.percentCompleted < 10 ? 2 : 1)}%
                </span>
              </li>
            ))}
        </ul>
      )}
    </Panel>
  );
}

export default function GameRail({
  leaderboardUrl,
  achievementsUrl,
}: GameRailProps): ReactNode {
  return (
    <div className={styles.stack}>
      <LeaderboardPanel url={leaderboardUrl} />
      <AchievementsPanel url={achievementsUrl} />
    </div>
  );
}
