import tokenize from '@/stages/tokenizer';
import parse from '@/stages/parser';
import generate from '@/stages/generator';
import { InputError } from '@/errors';
import log from '@/log';
import { existsSync, statSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

process.on('uncaughtException', (error) => {
    if (error instanceof InputError) {
        log('ERROR', error.data.message, error.data.location);
    } else {
        log('ERROR', ['Unexpected error']);
        console.error(error);
    }
});

main();

function main() {
    if (process.argv.length !== 4) {
        log('ERROR', ['Invalid number of arguments']);
        return;
    }

    const inputFileRelative = process.argv[2];
    const outputFileRelative = process.argv[3];

    const inputFile = resolve(inputFileRelative);
    const outputFile = resolve(outputFileRelative);

    if (!existsSync(inputFile)) {
        log('ERROR', ['File "', { value: inputFileRelative, bold: true }, '" not found']);
        return;
    }

    if (!statSync(inputFile).isFile()) {
        log('ERROR', ['"', { value: inputFileRelative, bold: true }, '" is not a file']);
        return;
    }

    const input = readFileSync(inputFile, 'utf8');

    const tokens = tokenize(inputFileRelative, input);

    const statements = parse(tokens);

    const assembly = generate(statements, 'debug');

    writeFileSync(outputFile, assembly.code);

    log('INFO', ['Done!']);
}
