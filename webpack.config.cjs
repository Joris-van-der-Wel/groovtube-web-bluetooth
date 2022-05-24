const path = require('path');

module.exports = {
    mode: 'production',
    entry: './lib/index.js',
    module: {
        rules: [
            {
                test: /\.ts?$/,
                exclude: /node_modules/,
                use: [{
                    loader: 'ts-loader',
                    options: {
                        configFile: 'tsconfig.json',
                    },
                }],
            },
        ],
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    output: {
        filename: 'umd.js',
        path: path.resolve(__dirname),
        library: {
            name: 'groovtube',
            type: 'umd',
        },
    },
};
