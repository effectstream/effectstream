import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import {translate} from '@docusaurus/Translate';
import {usePluralForm} from '@docusaurus/theme-common';
import {useBlogPost} from '@docusaurus/plugin-content-blog/client';
import type {Props} from '@theme/BlogPostItem/Header/Info';

function useReadingTimePlural() {
  const {selectMessage} = usePluralForm();
  return (readingTimeFloat: number) => {
    const readingTime = Math.ceil(readingTimeFloat);
    return selectMessage(
      readingTime,
      translate(
        {
          id: 'theme.blog.post.readingTime.plurals',
          description:
            'Pluralized label for "{readingTime} min read".',
          message: 'One min read|{readingTime} min read',
        },
        {readingTime},
      ),
    );
  };
}

export default function BlogPostItemHeaderInfo({className}: Props): ReactNode {
  const {metadata} = useBlogPost();
  const {readingTime} = metadata;
  const readingTimePlural = useReadingTimePlural();

  if (typeof readingTime === 'undefined') {
    return null;
  }

  return (
    <div className={clsx('margin-vert--md', className)} style={{fontSize: '0.9rem'}}>
      {readingTimePlural(readingTime)}
    </div>
  );
}
