import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import Layout from '@theme/Layout';
import BlogSidebar from '@theme/BlogSidebar';
import OriginalBlogLayout from '@theme-original/BlogLayout';
import type {Props} from '@theme/BlogLayout';
import {useIsGamesRoute} from '@site/src/theme/lcwg-route';

import styles from './styles.module.css';

function GamesBlogLayout(props: Props): ReactNode {
  const {sidebar, toc, children, ...layoutProps} = props;
  const hasSidebar = sidebar && sidebar.items.length > 0;

  return (
    <Layout {...layoutProps}>
      <div className={clsx('lcwg-section', styles.shell)}>
        <div className="container container--fluid margin-vert--lg">
          <div className="row">
            <BlogSidebar sidebar={sidebar} />
            <main className={clsx(styles.main, {[styles.mainNoSidebar]: !hasSidebar})}>
              {children}
            </main>
            {toc && <div className={clsx('col', styles.tocCol)}>{toc}</div>}
          </div>
        </div>
      </div>
    </Layout>
  );
}

export default function BlogLayout(props: Props): ReactNode {
  if (!useIsGamesRoute()) {
    return <OriginalBlogLayout {...props} />;
  }
  return <GamesBlogLayout {...props} />;
}
