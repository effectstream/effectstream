declare module 'vite-plugin-node-stdlib-browser' {
  import type { PluginOption } from 'vite';
  const plugin: () => PluginOption;
  export default plugin;
}
