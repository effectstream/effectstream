import {type ReactNode} from 'react';
import styles from './styles.module.css';

interface CompactCodeProps {
  /** Short title shown in the collapsed state. */
  summary: string;
  /** Set `open` to start expanded; default is collapsed. */
  open?: boolean;
  children: ReactNode;
}

/**
 * Collapsible code box for Compact snippets in game posts.
 * Starts minimized; click the summary to expand.
 * Children should typically be a fenced code block, e.g.
 *
 *   <CompactCode summary="Lobby state machine">
 *
 *   ```compact
 *   // ...
 *   ```
 *
 *   </CompactCode>
 */
export default function CompactCode({
  summary,
  open = false,
  children,
}: CompactCodeProps): ReactNode {
  return (
    <details className={styles.details} open={open}>
      <summary className={styles.summary}>
        <span className={styles.chevron} aria-hidden="true">▸</span>
        <span className={styles.tag}>Compact</span>
        <span className={styles.title}>{summary}</span>
        <span className={styles.toggle} aria-hidden="true" />
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}
