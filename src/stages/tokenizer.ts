import { InputError } from '../errors';
import log, { Location } from '@/log';

const symbols = [
    ';',
    '=',
    '+',
    '-',
    '*',
    '/',
    '(',
    ')'
] as const;

const keywords = [
    'const'
] as const;

export type SymbolToken = {
    type: 'symbol';
    value: typeof symbols[number];
    location: Location;
}

export type KeywordToken = {
    type: 'keyword';
    value: typeof keywords[number];
    location: Location;
}

export type IdentifierToken = {
    type: 'identifier';
    value: string;
    location: Location;
}

export type IntegerLiteralToken = {
    type: 'integer-literal';
    value: number;
    location: Location;
}

export type FloatLiteralToken = {
    type: 'float-literal';
    value: number;
    location: Location;
}

export type StringLiteralToken = {
    type: 'string-literal';
    value: string;
    location: Location;
}

export type Token = KeywordToken | SymbolToken | IdentifierToken | IntegerLiteralToken | FloatLiteralToken | StringLiteralToken;

export default function tokenize(file: string, input: string): Token[] {
    const tokens: Token[] = [];

    let line = 1;
    let column = 1;

    while (input.length > 0) {
        // Ignore whitespace
        {
            const match = input.match(/^[ \t]+/);
            if (match !== null) {
                input = input.slice(match[0].length);
                column += match[0].length;
                continue;
            }
        }

        // Ignore newlines
        {
            const match = input.match(/^\r?\n/);
            if (match !== null) {
                input = input.slice(match[0].length);
                line++;
                column = 1;
                continue;
            }
        }

        // Ignore comments
        {
            const match = input.match(/^\/\/.*\r?\n/);
            if (match !== null) {
                input = input.slice(match[0].length);
                line++;
                column = 1;
                continue;
            }
        }
        {
            const match = input.match(/^\/\*[\s\S]*?\*\//);
            if (match !== null) {
                input = input.slice(match[0].length);
                const lines = match[0].split('\n');
                line += lines.length - 1;
                column = lines.length === 1 ? column + lines[0].length : 1 + lines[lines.length - 1].length;
                continue;
            }
        }

        // Ignore control characters
        {
            const match = input.match(/^[\x00-\x1F]/);
            if (match !== null) {
                throw new InputError(['Unexpected control character: ', { value: JSON.stringify(match[0]), bold: true }], { file, line, column });
            }
        }

        // Match symbols
        {
            let matched = false;
            for (const symbol of symbols) {
                if (input.startsWith(symbol)) {
                    tokens.push({ type: 'symbol', value: symbol, location: { file, line, column } });
                    input = input.slice(symbol.length);
                    column += symbol.length;
                    matched = true;
                    break;
                }
            }

            if (matched) {
                continue;
            }
        }

        // Match number literals
        {
            const match = input.match(/^(?:0x|0b|0o)?[0-9]+(?:\.[0-9]+)?/);
            if (match !== null) {
                if (match[0].includes('.')) {
                    tokens.push({ type: 'float-literal', value: parseFloat(match[0]), location: { file, line, column } });
                } else {
                    tokens.push({ type: 'integer-literal', value: parseInt(match[0]), location: { file, line, column } });
                }

                input = input.slice(match[0].length);
                column += match[0].length;
                continue;
            }
        }

        // Match string literals
        {
            const match = input.match(/^'(?:[^'\\]|\\.)*'/) ?? input.match(/^"(?:[^"\\]|\\.)*"/);
            if (match !== null) {
                // W-DoubleQuotes
                if (match[0].startsWith('"') && !match[0].includes("'")) {
                    log('WARN', 'Double quotes are cringe', { file, line, column });
                }

                tokens.push({ type: 'string-literal', value: match[0].slice(1, -1), location: { file, line, column } });
                input = input.slice(match[0].length);
                column += match[0].length;
                continue;
            }
        }

        // Match keywords and identifiers
        {
            let buffer = '';
            while (input.length > 0 && ![' ', '\t', '\r', '\n', '/', ...symbols, '\'', '"'].some((i) => input.startsWith(i)) && !/^[\x00-\x1F]/.test(input)) {
                buffer += input[0];
                input = input.slice(1);
            }

            if (buffer === '') {
                throw new InputError(['Unexpected character: ', { value: JSON.stringify(input[0]), bold: true }], { file, line, column });
            }

            if (keywords.includes(buffer as any)) {
                tokens.push({ type: 'keyword', value: buffer as any, location: { file, line, column } });
            } else {
                // W-Snake
                if (buffer.split('').some((c, i) => c === '_' && i !== 0 && i !== buffer.length - 1 && /[a-z]/.test(buffer[i - 1]) && /[a-z]/.test(buffer[i + 1]))) {
                    log('WARN', 'Snake case is cringe', { file, line, column });
                }

                tokens.push({ type: 'identifier', value: buffer, location: { file, line, column } });
            }

            column += buffer.length;
        }
    }

    return tokens;
}
