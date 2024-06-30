const path = require('path');
const { exec } = require('child_process');

module.exports = (env, argv) => {
    const isDevelopment = argv.mode === 'development';

    return {
        mode: isDevelopment ? 'development' : 'production',
        devtool: isDevelopment ? 'inline-source-map' : undefined,
        target: 'node',
        entry: {
            main: './src/index.ts'
        },
        output: {
            path: path.resolve(__dirname, './dist'),
            filename: 'nitro.js'
        },
        resolve: {
            extensions: ['.ts', '.js'],
            alias: {
                '@': path.resolve(__dirname, 'src')
            }
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
        plugins: [{
            apply: (compiler) => {
                if (!isDevelopment) return;
                compiler.hooks.afterEmit.tap('AfterEmitPlugin', (compilation) => {
                    exec('npm run start', (err, stdout, stderr) => {
                        if (stdout) process.stdout.write(stdout);
                        if (stderr) process.stderr.write(stderr);
                    });
                });
            }
        }, {
            apply: (compiler) => {
                if (!isDevelopment) return;
                compiler.hooks.afterCompile.tap('AfterCompilePlugin', (compilation) => {
                    compilation.fileDependencies.add(path.resolve(__dirname, 'test', 'input.nitro'));
                });
            }
        }],
        watchOptions: {
            ignored: /node_modules/
        }
    }
}
