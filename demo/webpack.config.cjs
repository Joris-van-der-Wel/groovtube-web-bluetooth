const path = require('path');

module.exports = {
    mode: 'production',
    entry: './src/demo.js',
    resolve: {
        alias: {
            // omit the next line if you are copy-pasting this example to your own project
            groovtube$: path.resolve(__dirname, '..', 'lib'),
        },
    },
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist'),
    },
    devServer: {
        hot: false,
        liveReload: false,
        static: {
            directory: path.join(__dirname, 'public'),
        },
    },
};
