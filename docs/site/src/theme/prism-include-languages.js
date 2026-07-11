// Swizzle of @docusaurus/theme-classic/lib/theme/prism-include-languages.js.
// Reason: Docusaurus loads additionalLanguages via a templated require that
// webpack resolves against prismjs/components/. Languages that aren't part
// of the prismjs npm package (like our custom Compact) need a custom require
// path — this swizzle short-circuits 'compact' to our local definition file
// and delegates everything else to the original behavior.

import siteConfig from '@generated/docusaurus.config';

export default function prismIncludeLanguages(PrismObject) {
  const {
    themeConfig: {prism},
  } = siteConfig;
  const {additionalLanguages} = prism;

  const PrismBefore = globalThis.Prism;
  globalThis.Prism = PrismObject;

  additionalLanguages.forEach((lang) => {
    if (lang === 'compact') {
      // eslint-disable-next-line global-require
      require('@site/src/prism-compact.js');
      return;
    }
    if (lang === 'php') {
      // eslint-disable-next-line global-require
      require('prismjs/components/prism-markup-templating.js');
    }
    // eslint-disable-next-line global-require, import/no-dynamic-require
    require(`prismjs/components/prism-${lang}`);
  });

  delete globalThis.Prism;
  if (typeof PrismBefore !== 'undefined') {
    globalThis.Prism = PrismObject;
  }
}
