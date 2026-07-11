import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import {useBaseUrlUtils} from '@docusaurus/useBaseUrl';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import OriginalBlogListPage from '@theme-original/BlogListPage';
import type {Props} from '@theme/BlogListPage';
import {useIsGamesRoute} from '@site/src/theme/lcwg-route';

import styles from './styles.module.css';

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

type GameCardData = {
  slug: string;
  title: string;
  description: string;
  permalink: string;
  image: string;
};

function cardsFromItems(
  items: Props['items'],
  withBaseUrl: (path: string) => string,
): GameCardData[] {
  const cards = items.map((item) => {
    const {metadata, frontMatter} = item.content;
    const slug = (frontMatter.slug as string | undefined) ?? metadata.permalink.split('/').pop() ?? '';
    return {
      slug,
      title: (frontMatter.title as string | undefined) ?? metadata.title,
      description:
        (frontMatter.description as string | undefined) ??
        metadata.description ??
        '',
      permalink: metadata.permalink,
      image: withBaseUrl(`/img/games/${slug}.jpg`),
    };
  });
  // Reverse Docusaurus default (newest first) into demo's oldest-first ordering.
  return cards.reverse();
}

function GameCard({game, index}: {game: GameCardData; index: number}): ReactNode {
  const code = `A-${pad2(index + 1)}`;
  return (
    <Link to={game.permalink} className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardCode}>{code}</span>
        <span className={styles.cardStatus}>● PLAYABLE</span>
      </div>
      <img
        className={styles.cardImage}
        src={game.image}
        alt={`${game.title} cover`}
        loading="lazy"
      />
      <div className={styles.cardBody}>
        <div className={styles.cardFig}>
          <span>FIG. {pad2(index + 1)}</span>
          <span className={styles.cardFigDot}>·</span>
          <span>Live demonstration</span>
        </div>
        <Heading as="h3" className={styles.cardTitle}>
          {game.title}
        </Heading>
        <p className={styles.cardDescription}>{game.description}</p>
      </div>
    </Link>
  );
}

function GamesBlogListPage(props: Props): ReactNode {
  const {metadata} = props;
  const title = metadata.blogTitle;
  const description = metadata.blogDescription;
  const {withBaseUrl} = useBaseUrlUtils();
  const cards = cardsFromItems(props.items, withBaseUrl);
  return (
    <Layout title={title} description={description}>
      <div className={clsx('lcwg-section', styles.shell)}>
        <header className={clsx('hero', styles.heroBanner)}>
          <div className={clsx('container', styles.heroInner)}>
            <Heading as="h1" className={clsx('hero__title', styles.heroTitle)}>
              {title}
            </Heading>
            <p className={clsx('hero__subtitle', styles.heroSubtitle)}>
              {description}
            </p>
          </div>
        </header>
        <main className="container">
          <section className={styles.grid}>
            {cards.map((game, i) => (
              <GameCard key={game.slug || i} game={game} index={i} />
            ))}
          </section>
        </main>
      </div>
    </Layout>
  );
}

export default function BlogListPage(props: Props): ReactNode {
  if (!useIsGamesRoute()) {
    return <OriginalBlogListPage {...props} />;
  }
  return <GamesBlogListPage {...props} />;
}
