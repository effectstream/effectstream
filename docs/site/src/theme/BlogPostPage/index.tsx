import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import {HtmlClassNameProvider, ThemeClassNames} from '@docusaurus/theme-common';
import {useIsGamesRoute} from '@site/src/theme/lcwg-route';
import {
  BlogPostProvider,
  useBlogPost,
} from '@docusaurus/plugin-content-blog/client';
import BlogLayout from '@theme/BlogLayout';
import BlogPostItem from '@theme/BlogPostItem';
import BlogPostPaginator from '@theme/BlogPostPaginator';
import BlogPostPageMetadata from '@theme/BlogPostPage/Metadata';
import BlogPostPageStructuredData from '@theme/BlogPostPage/StructuredData';
import ContentVisibility from '@theme/ContentVisibility';
import OriginalBlogPostPage from '@theme-original/BlogPostPage';
import type {Props} from '@theme/BlogPostPage';
import type {BlogSidebar} from '@docusaurus/plugin-content-blog';

import GameRail from '@site/src/components/GameRail';
import styles from './styles.module.css';

function BlogPostRightRail(): ReactNode {
  const {metadata} = useBlogPost();
  const slug = metadata.frontMatter.slug as string | undefined;
  if (!slug) {
    return null;
  }
  const leaderboardUrl = metadata.frontMatter.leaderboardUrl as string | undefined;
  const achievementsUrl = metadata.frontMatter.achievementsUrl as string | undefined;
  return (
    <div className={styles.rail}>
      <GameRail
        slug={slug}
        leaderboardUrl={leaderboardUrl}
        achievementsUrl={achievementsUrl}
      />
    </div>
  );
}

function GamesBlogPostPageContent({
  sidebar,
  children,
}: {
  sidebar: BlogSidebar;
  children: ReactNode;
}): ReactNode {
  const {metadata} = useBlogPost();
  const {nextItem, prevItem} = metadata;
  return (
    <BlogLayout sidebar={sidebar} toc={<BlogPostRightRail />}>
      <ContentVisibility metadata={metadata} />
      <BlogPostItem>{children}</BlogPostItem>
      {(nextItem || prevItem) && (
        <BlogPostPaginator nextItem={nextItem} prevItem={prevItem} />
      )}
    </BlogLayout>
  );
}

function GamesBlogPostPage(props: Props): ReactNode {
  const BlogPostContent = props.content;
  return (
    <BlogPostProvider content={props.content} isBlogPostPage>
      <HtmlClassNameProvider
        className={clsx(
          ThemeClassNames.wrapper.blogPages,
          ThemeClassNames.page.blogPostPage,
        )}>
        <BlogPostPageMetadata />
        <BlogPostPageStructuredData />
        <GamesBlogPostPageContent sidebar={props.sidebar}>
          <BlogPostContent />
        </GamesBlogPostPageContent>
      </HtmlClassNameProvider>
    </BlogPostProvider>
  );
}

export default function BlogPostPage(props: Props): ReactNode {
  if (!useIsGamesRoute()) {
    return <OriginalBlogPostPage {...props} />;
  }
  return <GamesBlogPostPage {...props} />;
}
