import { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill';
import { build } from 'esbuild';
build({
        entryPoints: ['./index.js'],
        bundle: true,
        outfile: 'min.js',
        sourcemap: true,
	plugins: [nodeModulesPolyfillPlugin({
                globals: {
                        process: true,
                        Buffer: true,
                },
        })]
});

