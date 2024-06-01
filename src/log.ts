import { existsSync, statSync, readFileSync } from 'fs';

export type Location = { file: string, line: number, column: number };

export default function log(type: 'INFO' | 'WARN' | 'ERROR', message: string | (string | { value: string, bold: boolean })[], location: Location | null = null): void {
    const color = { 'INFO': '\x1b[36m', 'WARN': '\x1b[33m', 'ERROR': '\x1b[31m' }[type];

    if (location !== null) {
        process.stdout.write(`\x1b[0m\nAt ${location.file}:${location.line}:${location.column}\n\n`);
        if (existsSync(location.file) && statSync(location.file).isFile()) {
            const content = readFileSync(location.file, 'utf8').split('\n');
            process.stdout.write(`    \x1b[1m${content[location.line - 1]}\x1b[0m\n`);
            process.stdout.write(`    ${' '.repeat(location.column - 1)}^\n`);
        }
    }

    process.stdout.write(`\x1b[0m${color}\x1b[1m${{ 'INFO': 'Info: ', 'WARN': 'Warning: ', 'ERROR': 'Error: ' }[type]}\x1b[0m${color}${Array.isArray(message) ? message.map((chunk) => typeof chunk === 'string' ? chunk : chunk.bold ? `\x1b[1m${chunk.value}\x1b[0m${color}` : chunk.value).join('') : message}\x1b[0m\n`);
}
