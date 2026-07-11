import {type ReactNode} from 'react';
import {useBlogPost} from '@docusaurus/plugin-content-blog/client';
import styles from './styles.module.css';

interface GameRepoProps {
  /** Override the URL pulled from frontmatter (`repoUrl`). */
  url?: string;
  /** Override the link label. */
  label?: string;
}

/**
 * Renders a "Source on GitHub" link for the current game post.
 * The URL comes from the post's frontmatter `repoUrl` field unless
 * passed as a prop. Returns null if no URL is configured.
 */
export default function GameRepo({url, label}: GameRepoProps): ReactNode {
  const {metadata} = useBlogPost();
  const repoUrl = url ?? (metadata.frontMatter.repoUrl as string | undefined);
  if (!repoUrl) {
    return null;
  }
  return (
    <a
      href={repoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.link}>
      <span className={styles.glyph}>{'</>'}</span>
      <span className={styles.text}>{label ?? 'View source on GitHub'}</span>
      <span className={styles.arrow}>→</span>
    </a>
  );
}
