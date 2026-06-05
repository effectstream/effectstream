/**
 * Remark plugin: append <DiscordCTA /> as the last element of every
 * games-section post, so the community call-to-action sits at the end.
 * DiscordCTA is registered globally via src/theme/MDXComponents.tsx, so
 * MDX resolves it without an import, and it renders its own labeled box
 * (no surrounding heading needed).
 *
 * Registered only on the games-blog plugin instance in docusaurus.config.ts,
 * so the existing main blog at /blog is unaffected.
 */
module.exports = function remarkDiscordCTA() {
  return (tree) => {
    // Skip if a DiscordCTA was already placed explicitly in the source.
    const exists = tree.children.some(
      (node) => node.type === 'mdxJsxFlowElement' && node.name === 'DiscordCTA',
    );
    if (exists) return;
    tree.children.push({
      type: 'mdxJsxFlowElement',
      name: 'DiscordCTA',
      attributes: [],
      children: [],
    });
  };
};
