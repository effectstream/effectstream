const dotenv = require('dotenv')
dotenv.config({ path: `./../../.env.${process.env.NETWORK ?? "localhost"}` });

module.exports = {
  mode: 'development',
  entry: ['./src/main.tsx'],
  module: {
    rules: require('./webpack.rules'),
  },
  output: {
    filename: '[name].js',
    chunkFilename: '[name].chunk.js',
  },
  plugins: require('./webpack.plugins'),
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
    alias: require('./webpack.aliases'),
    fallback: {
      fs: false,
    },
  },
  stats: 'errors-warnings',
  devtool: 'eval-source-map',
  devServer: {
    open: true,
    client: {
      overlay: {errors: true, warnings: false}
    }
  },
  optimization: {
    splitChunks: {
      chunks: 'all',
    },
  },
  performance: {
    hints: false,
  },
};
