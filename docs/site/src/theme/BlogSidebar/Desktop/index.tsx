import React, {memo} from 'react';
import clsx from 'clsx';
import {translate} from '@docusaurus/Translate';
import {
  useVisibleBlogSidebarItems,
  BlogSidebarItemList,
} from '@docusaurus/plugin-content-blog/client';
import BlogSidebarContent from '@theme/BlogSidebar/Content';
import OriginalBlogSidebarDesktop from '@theme-original/BlogSidebar/Desktop';
import type {Props as BlogSidebarContentProps} from '@theme/BlogSidebar/Content';
import type {Props} from '@theme/BlogSidebar/Desktop';
import {useIsGamesRoute} from '@site/src/theme/lcwg-route';

import styles from './styles.module.css';

const ListComponent: BlogSidebarContentProps['ListComponent'] = ({items}) => {
  return (
    <BlogSidebarItemList
      items={items}
      ulClassName={clsx(styles.sidebarItemList, 'clean-list')}
      liClassName={styles.sidebarItem}
      linkClassName={styles.sidebarItemLink}
      linkActiveClassName={styles.sidebarItemLinkActive}
    />
  );
};

function GamesBlogSidebarDesktop({sidebar}: Props) {
  const items = [...useVisibleBlogSidebarItems(sidebar.items)].reverse();
  return (
    <aside className={styles.aside}>
      <nav
        className={clsx(styles.sidebar, 'thin-scrollbar')}
        aria-label={translate({
          id: 'theme.blog.sidebar.navAriaLabel',
          message: 'Blog recent posts navigation',
          description: 'The ARIA label for recent posts in the blog sidebar',
        })}>
        <div className={clsx(styles.sidebarItemTitle, 'margin-bottom--sm')}>
          ◇ Games
        </div>
        <BlogSidebarContent
          items={items}
          ListComponent={ListComponent}
          yearGroupHeadingClassName={styles.yearGroupHeading}
        />
      </nav>
    </aside>
  );
}

function BlogSidebarDesktop(props: Props) {
  if (!useIsGamesRoute()) {
    return <OriginalBlogSidebarDesktop {...props} />;
  }
  return <GamesBlogSidebarDesktop {...props} />;
}

export default memo(BlogSidebarDesktop);
