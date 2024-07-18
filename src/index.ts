import tokenize from '@/stages/tokenizer';
import parse from '@/stages/parser';
import { InputError } from '@/errors';
import log from '@/log';
import { existsSync, statSync, readFileSync } from 'fs';

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
    if (process.argv.length !== 3) {
        log('ERROR', ['Invalid number of arguments']);
        return;
    }

    const file = process.argv[2];

    if (!existsSync(file)) {
        log('ERROR', ['File "', { value: file, bold: true }, '" not found']);
        return;
    }

    if (!statSync(file).isFile()) {
        log('ERROR', ['"', { value: file, bold: true }, '" is not a file']);
        return;
    }

    const input = readFileSync(file, 'utf8');

    const tokens = tokenize(file, input);

    console.log(JSON.stringify(tokens));

    const statements = parse(tokens);

    console.log(JSON.stringify(statements));
}
