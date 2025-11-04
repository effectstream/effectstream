// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const { themes } = require('prism-react-renderer');
const math = require('remark-math');
const katex = require('rehype-katex');
const https = require('https');
const stream = require('stream');

/** @returns (url: string) => Promise<string> */
function httpsRequest(url) {
  return new Promise((resolve, reject) => { 
    const options = {
      hostname: new URL(url).hostname,
      path: new URL(url).pathname,
      headers: {
        'User-Agent': 'curl/7.81.0',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
        // 'Authorization': 'Bearer ___',
      }
    };
    https.get(options, res => {
      res.setEncoding('utf8');

      let content = '';
      res.on('data', function(chunk) {
        content += chunk;
      }).on('end', function() {
        resolve(content);
      })
    }).on('error', reject);
  });
}
/** @returns () => Promise<string[]> */
async function getMarkdownFiles() {
  if (process.env.npm_lifecycle_script !== 'docusaurus download-remote-prc') {
    return [];
  }
  const data = await httpsRequest('https://api.github.com/repos/PaimaStudios/PRC/contents/PRCS');
  /** @type Array<{ name: string }> */
  const result = JSON.parse(data);
  return result.map(file => file.name);
}

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Effectstream",
  //  tagline: 'Getting started',
  url: "https://effectstream.github.io",
  baseUrl: "/docs/",
  onBrokenLinks: "warn",
  onBrokenMarkdownLinks: "warn",
  favicon: "img/favicon.ico",

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: "Effectstream", // Usually your GitHub org/user name.
  projectName: "effectstream-engine-docs", // Usually your repo name.

  // Even if you don't use internalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: "en",
    locales: ["en", "ja"],
    localeConfigs: {
      en: {
        label: "English",
      },
      ja: {
        label: "Japanese",
      },
    },
  },
  themes: [
    // ... Your other themes.
    '@docusaurus/theme-mermaid',
    [
      require.resolve("@easyops-cn/docusaurus-search-local"),
      {
        docsRouteBasePath: '/',
        // ... Your options.
        // `hashed` is recommended as long-term-cache of index file is possible.
        hashed: true,
        // For Docs using Chinese, The `language` is recommended to set to:
        // ```
        // language: ["en", "zh"],
        // ```
      },
    ],
  ],

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve("./sidebars.js"),
          routeBasePath: "/",
          breadcrumbs: false,
          remarkPlugins: [math],
          rehypePlugins: [katex],
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl: "https://github.com/PaimaStudios/paima-engine-docs/tree/main",
        },
        // pages: {
        //   path: 'docs/home',
        //   routeBasePath: '/',
        // },
        // pages: {
        //   path: 'src/pages',
        //   routeBasePath: '/',
        //   include: ['**/*.{js,jsx,ts,tsx,md,mdx}'],
        //   exclude: [
        //     '**/_*.{js,jsx,ts,tsx,md,mdx}',
        //     '**/_*/**',
        //     '**/*.test.{js,jsx,ts,tsx}',
        //     '**/__tests__/**',
        //   ],
        //   mdxPageComponent: '@theme/MDXPage',
        //   //remarkPlugins: [require('remark-math')],
        //   rehypePlugins: [],
        //   beforeDefaultRemarkPlugins: [],
        //   beforeDefaultRehypePlugins: [],
        // },          
        //blog: false,
        // blog: {
        //   showReadingTime: true,
        //   // Please change this to your repo.
        //   // Remove this to remove the "edit this page" links.
        //   // editUrl: "https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/",
        // },
        theme: {
          customCss: require.resolve("./src/css/custom.css"),
        },
      }),
    ],
  ],
  plugins: [
    async function myPlugin(context, options) {
      return {
        name: "docusaurus-tailwindcss",
        configurePostCss(postcssOptions) {
          // Appends TailwindCSS and AutoPrefixer.
          postcssOptions.plugins.push(require("tailwindcss"));
          postcssOptions.plugins.push(require("autoprefixer"));
          return postcssOptions;
        },
      };
    },
    [
      '@docusaurus/plugin-client-redirects',
      {
        createRedirects(existingPath) {
          if (existingPath.includes('/chain-data-extensions')) {
            // Redirect from /docs/team/X to /community/X and /docs/support/X to /community/X
            return [
              existingPath.replace('/primitive-catalogue', '/chain-data-extensions'),
            ];
          }
          return undefined; // Return a falsy value: no redirect created
        },
      }
    ],
    [
      // we use this plugin instead of using iframes so that the content is all statically searchable
      "docusaurus-plugin-remote-content",
      {
          // run `yarn update:prc` to update the files
          name: "prc", // used by CLI, must be path safe
          sourceBaseUrl: "https://raw.githubusercontent.com/PaimaStudios/PRC/main/PRCS/",
          outDir: "docs/home/20000-PRCs", // the base directory to output to.
          documents: (async () => getMarkdownFiles())(), // the file names to download
          modifyContent(filename, content) {
            // replace (../ so that relative URLS turn into absolute URLs
            let modifiedContent = content;
            const fileWithoutExtension = filename.replace(/.md$/, '');
            modifiedContent = modifiedContent.replace(/title: (.*)(?=\r?\n)/g, `title: ${fileWithoutExtension}：$1`);
            modifiedContent = modifiedContent.replace(/\(\.\.\//g, "(https://raw.githubusercontent.com/PaimaStudios/PRC/main/");
            return {
              filename,
              content: modifiedContent,
            };
          },
          // otherwise this updates too often and you run into the github api limit
          noRuntimeDownloads: true
      },
    ]
  ],
  stylesheets: [
    {
      href: 'https://cdn.jsdelivr.net/npm/katex@0.12.0/dist/katex.min.css',
      type: 'text/css',
      integrity:
        'sha384-AfEj0r4/OFrOo5t7NnNe46zW/tFgW6x/bCJG8FqQCEo3+Aro6EYUG4+cU+KJWu/X',
      crossorigin: 'anonymous',
    },
  ],
  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      announcementBar: {
        id: 'v2-announcement',
        content: `
      <div class="custom-banner">
        <p><strong>You are looking at Effectstream v2 docs</strong></p>
        <p>Effectstream v2 is still under construction🚧</p>
      </div>
    `,
        backgroundColor: '#fffcf9', 
        textColor: '#ef476f',
        isCloseable: false,
      },
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: true,
        respectPrefersColorScheme: false,
      },
      mermaid: {
        theme: { light: 'base', dark: 'base' },
        options: {
          themeVariables: {
            'primaryColor': '#12271F',
            'primaryTextColor': '#fff',
            'lineColor': '#aaa',
            'edgeLabelBackground': '#030909',
            'tertiaryColor': '#fff',
            'clusterBkg': '#00130C',
            'clusterBorder': '000',
            'titleColor': '#aaa',
            'activationBkgColor': '#003320',
          }
        }
      },
      image: 'img/paima-banner.png',
      navbar: {
        title: "Effectstream",
        logo: {
          alt: "Effectstream logo",
          src: "img/favicon.ico",
          href: "/",
          target: '_self',          
        },
        items: [
          {
            type: "localeDropdown",
            position: "right",
          },      
          // {
          //   type: "doc",
          //   docId: "intro",
          //   position: "left",
          //   label: "Tutorial",
          // },
          // { to: "/blog", label: "Blog", position: "left" },
          // {
          //   href: "https://github.com/facebook/docusaurus",
          //   label: "GitHub",
          //   position: "right",
          // },
        ],
      },
      footer: {
        style: "dark",
        // links: [
        //   {
        //     title: "Docs",
        //     items: [
        //       {
        //         label: "Tutorial",
        //         to: "/docs/intro",
        //       },
        //     ],
        //   },
        //   {
        //     title: "Community",
        //     items: [
        //       {
        //         label: "Stack Overflow",
        //         href: "https://stackoverflow.com/questions/tagged/docusaurus",
        //       },
        //       {
        //         label: "Discord",
        //         href: "https://discordapp.com/invite/docusaurus",
        //       },
        //       {
        //         label: "Twitter",
        //         href: "https://twitter.com/docusaurus",
        //       },
        //     ],
        //   },
        //   {
        //     title: "More",
        //     items: [
        //       {
        //         label: "Blog",
        //         to: "/blog",
        //       },
        //       {
        //         label: "GitHub",
        //         href: "https://github.com/facebook/docusaurus",
        //       },
        //     ],
        //   },
        // ],
        copyright: `Copyright © ${new Date().getFullYear()} Midnight Foundation. Built with Docusaurus.`,
      },
      prism: {
        darkTheme: themes.dracula,
        additionalLanguages: ['solidity', 'bash'],
        magicComments: [
          {
            className: 'theme-code-block-highlighted-line',
            line: 'highlight-next-line',
            block: {start: 'highlight-start', end: 'highlight-end'},
          },
          {
            className: 'code-block-alternate-color-line',
            line: 'alternate-color-next-line',
            block: {start: 'alternate-color-start', end: 'alternate-color-end'},
          },
        ]
      },
    }),
    markdown: {
      mermaid: true,
    },
};

module.exports = config;
