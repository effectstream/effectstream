import {type ReactNode} from 'react';
import styles from './styles.module.css';

const DISCORD_URL = 'https://discord.com/invite/midnightnetwork';

interface DiscordCTAProps {
  message?: string;
}

export default function DiscordCTA({
  message = 'Have questions about the techniques in this post? Drop into the Midnight Discord - happy to talk it through.',
}: DiscordCTAProps): ReactNode {
  return (
    <aside className={styles.wrapper} role="complementary">
      <div className={styles.label}>◇ Note · Community</div>
      <div className={styles.body}>
        <p className={styles.message}>{message}</p>
        <a
          className={styles.action}
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer">
          Join Midnight Discord →
        </a>
      </div>
    </aside>
  );
}
