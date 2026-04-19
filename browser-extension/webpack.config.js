const path = require('path');
module.exports = {
  mode: 'production',
  entry: {
    content: './content.ts',
    background: './background.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
  },
  module: {
    rules: [{
      test: /\.ts$/,
      use: 'ts-loader',
      exclude: /node_modules/,
    }],
  },
  resolve: { extensions: ['.ts', '.js'] },
};
