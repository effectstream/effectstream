/**
 * Remark plugin: insert <DiscordCTA /> after the first paragraph
 * in every games-section post. DiscordCTA is registered globally via
 * src/theme/MDXComponents.tsx, so MDX resolves it without an import.
 *
 * Registered only on the games-blog plugin instance in docusaurus.config.ts,
 * so the existing main blog at /blog is unaffected.
 */
module.exports = function remarkDiscordCTA() {
  return (tree) => {
    const idx = tree.children.findIndex((node) => node.type === 'paragraph');
    if (idx < 0) return;
    tree.children.splice(idx + 1, 0, {
      type: 'mdxJsxFlowElement',
      name: 'DiscordCTA',
      attributes: [],
      children: [],
    });
  };
};
