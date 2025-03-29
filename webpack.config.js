const path = require('path');

module.exports = (env, argv) => {
    const isDevelopment = argv.mode === 'development';

    return {
        target: 'node',
        entry: path.resolve(__dirname, 'src/index.ts'),
        devtool: isDevelopment ? 'inline-source-map' : false,
        output: {
            filename: 'nitro.js',
            path: path.resolve(__dirname, 'dist'),
            clean: true
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    use: 'ts-loader',
                    exclude: /node_modules/
                }
            ]
        },
        resolve: {
            extensions: ['.ts', '.js'],
            alias: {
                '@': path.resolve(__dirname, 'src')
            }
        }
    }
}
