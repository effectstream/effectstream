import {type ReactNode} from 'react';
import Link from '@docusaurus/Link';
import styles from './styles.module.css';

interface MultiChainNoteProps {
  /** Override the default message if a specific post needs to tweak it. */
  message?: string;
}

const DEFAULT_MESSAGE =
  'EffectStream is a multi-chain library - you can easily swap the chain or add more wallets: Cardano, EVM chains, Midnight, Bitcoin, and more.';

export default function MultiChainNote({
  message = DEFAULT_MESSAGE,
}: MultiChainNoteProps): ReactNode {
  return (
    <aside className={styles.wrapper} role="note">
      <div className={styles.label}>◇ Note · Multi-chain</div>
      <div className={styles.body}>
        <p className={styles.message}>{message}</p>
        <Link to="/home/chains/" className={styles.action}>
          Browse supported chains →
        </Link>
      </div>
    </aside>
  );
}
