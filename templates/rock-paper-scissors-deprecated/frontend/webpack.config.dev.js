const path = require('path');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const webpack = require('webpack');
require('dotenv').config({ path: `./../../.env.${process.env.NETWORK ?? "localhost"}` });


if (!process.env.CHAIN_URI || !process.env.BACKEND_URI || !process.env.CHAIN_ID)
  throw new Error('Please ensure you have filled out your .env file');

module.exports = {
  entry: './src/index.ts',
  devtool: 'inline-source-map',
  output: {
    path: path.resolve(__dirname, 'public/dist'),
    filename: 'bundle.js',
    publicPath: '/public/dist',
  },
  devServer: {
    static: path.resolve(__dirname, './public'),
    host: 'localhost',
    port: 9000,
    open: false,
    devMiddleware: {
      index: true,
      publicPath: '/public',
      serverSideRender: true,
      writeToDisk: true,
    },
  },
  plugins: [
    new NodePolyfillPlugin(),

    new webpack.ProvidePlugin({
      process: 'process/browser',
    }),
    new webpack.DefinePlugin({
      'process.env': JSON.stringify(process.env),
    }),
    new webpack.SourceMapDevToolPlugin({
      filename: '[file].map',
    }),
  ],
  module: {
    rules: [
      {
        test: /\.ts$/,
        include: path.resolve(__dirname, 'src'),
        loader: 'ts-loader',
      },
      {
        test: require.resolve('phaser'),
        loader: 'expose-loader',
        options: { exposes: { globalName: 'Phaser', override: true } },
      },
      {
        test: /\.m?js/,
        type: 'javascript/auto',
      },
      {
        test: /\.m?js/,
        resolve: {
          fullySpecified: false,
        },
      },
      { test: /\.json$/, type: 'json' },
    ],
  },

  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      http: require.resolve('stream-http'),
      https: require.resolve('https-browserify'),
      os: require.resolve('os-browserify'),
      url: require.resolve('url/'),
      zlib: require.resolve('browserify-zlib'),
      assert: require.resolve('assert/'),
    },
  },
};
