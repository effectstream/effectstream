import React, {type ReactNode} from 'react';
import OriginalBlogPostItemHeader from '@theme-original/BlogPostItem/Header';
import BlogPostItemHeaderAuthors from '@theme/BlogPostItem/Header/Authors';
import {useIsGamesRoute} from '@site/src/theme/lcwg-route';

export default function BlogPostItemHeader(): ReactNode {
  if (!useIsGamesRoute()) {
    return <OriginalBlogPostItemHeader />;
  }
  return <BlogPostItemHeaderAuthors />;
}
