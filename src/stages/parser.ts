import { Token } from '@/stages/tokenizer';
import { InputError } from '@/errors';
import { Location } from '@/log';

export type DeclarationStatement = {
    type: 'declaration';
    typeIdentifier: string;
    variableIdentifier: string;
    const: boolean;
    location: Location;
}

export type DeclarationWithAssignmentStatement = {
    type: 'declaration-with-assignment';
    typeIdentifier: string;
    variableIdentifier: string;
    const: boolean;
    assignment: Expression;
    location: Location;
}

export type AssignmentStatement = {
    type: 'assignment';
    variableIdentifier: string;
    assignment: Expression;
    location: Location;
}

export type Statement = DeclarationStatement | DeclarationWithAssignmentStatement | AssignmentStatement;

export type IntegerLiteralPrimitiveExpression = {
    type: 'integer-literal';
    value: number;
    location: Location;
}

export type FloatLiteralPrimitiveExpression = {
    type: 'float-literal';
    value: number;
    location: Location;
}

export type StringLiteralPrimitiveExpression = {
    type: 'string-literal';
    value: string;
    location: Location;
}

export type VariablePrimitiveExpression = {
    type: 'variable';
    identifier: string;
    location: Location;
}

export type SubExpressionPrimitiveExpression = {
    type: 'sub-expression';
    expression: Expression;
    location: Location;
}

export type PrimitiveExpression = IntegerLiteralPrimitiveExpression | FloatLiteralPrimitiveExpression | StringLiteralPrimitiveExpression | VariablePrimitiveExpression | SubExpressionPrimitiveExpression;

export type AdditionBinaryExpression = {
    type: 'addition';
    left: Expression;
    right: Expression;
    location: Location;
}

export type SubtractionBinaryExpression = {
    type: 'subtraction';
    left: Expression;
    right: Expression;
    location: Location;
}

export type MultiplicationBinaryExpression = {
    type: 'multiplication';
    left: Expression;
    right: Expression;
    location: Location;
}

export type DivisionBinaryExpression = {
    type: 'division';
    left: Expression;
    right: Expression;
    location: Location;
}

export type BinaryExpression = AdditionBinaryExpression | SubtractionBinaryExpression | MultiplicationBinaryExpression | DivisionBinaryExpression;

export type Expression = PrimitiveExpression | BinaryExpression;

const binaryOperators: { [K in BinaryExpression['type']]: Extract<Token, { type: 'symbol' }>['value'] } = {
    'addition': '+',
    'subtraction': '-',
    'multiplication': '*',
    'division': '/'
}

const binaryOperatorPrecedence: { [K in BinaryExpression['type']]: number } = {
    'addition': 1,
    'subtraction': 1,
    'multiplication': 2,
    'division': 2
}

const binaryOperatorAssociativity: { [K in BinaryExpression['type']]: 'left' | 'right' } = {
    'addition': 'left',
    'subtraction': 'left',
    'multiplication': 'left',
    'division': 'left'
}

export default function parse(tokens: Token[]): Statement[] {
    const statements: Statement[] = [];

    while (tokens.length > 0) {
        // Parse declaration
        {
            const [match, tokenCount] = matchPattern(tokens, [
                { type: 'keyword', value: 'const', optional: true },
                { type: 'identifier' },
                { type: 'identifier' },
                { type: 'symbol', value: ';' }
            ]);
            if (match !== null) {
                const [
                    constToken,
                    typeIdentifierToken,
                    variableIdentifierToken,
                    semicolonToken
                ] = match;

                statements.push({
                    type: 'declaration',
                    typeIdentifier: typeIdentifierToken.value,
                    variableIdentifier: variableIdentifierToken.value,
                    const: constToken !== null,
                    location: constToken?.location ?? typeIdentifierToken.location
                });

                tokens = tokens.slice(tokenCount);
                continue;
            }
        }

        // Parse declaration with assignment
        {
            const [match, tokenCount] = matchPattern(tokens, [
                { type: 'keyword', value: 'const', optional: true },
                { type: 'identifier' },
                { type: 'identifier' },
                { type: 'symbol', value: '=' },
                { type: 'expression' },
                { type: 'symbol', value: ';' }
            ]);
            if (match !== null) {
                const [
                    constToken,
                    typeIdentifierToken,
                    variableIdentifierToken,
                    equalsToken,
                    assignment,
                    semicolonToken
                ] = match;

                statements.push({
                    type: 'declaration-with-assignment',
                    typeIdentifier: typeIdentifierToken.value,
                    variableIdentifier: variableIdentifierToken.value,
                    const: constToken !== null,
                    assignment,
                    location: constToken?.location ?? typeIdentifierToken.location
                });

                tokens = tokens.slice(tokenCount);
                continue;
            }
        }

        // Parse assignment
        {
            const [match, tokenCount] = matchPattern(tokens, [
                { type: 'identifier' },
                { type: 'symbol', value: '=' },
                { type: 'expression' },
                { type: 'symbol', value: ';' }
            ]);
            if (match !== null) {
                const [
                    variableIdentifierToken,
                    equalsToken,
                    assignment,
                    semicolonToken
                ] = match;

                statements.push({
                    type: 'assignment',
                    variableIdentifier: variableIdentifierToken.value,
                    assignment,
                    location: variableIdentifierToken.location
                });

                tokens = tokens.slice(tokenCount);
                continue;
            }
        }

        throw new InputError(['Expected statement'], tokens[0].location);
    }

    return statements;
}

function parseExpression(tokens: Token[]): [Expression, number] {
    return parseBinaryExpression(tokens, 0);
}

function parseBinaryExpression(tokens: Token[], precedence: number): [Expression, number] {
    let [result, tokenCount]: [Expression, number] = parsePrimitiveExpression(tokens);
    tokens = tokens.slice(tokenCount);

    while (tokens.length > 0 && tokens[0].type === 'symbol' && Object.values(binaryOperators).includes(tokens[0].value)) {
        const binaryOperatorType = Object.entries(binaryOperators).find(([key, value]) => value === tokens[0].value)![0] as BinaryExpression['type'];
        if (binaryOperatorPrecedence[binaryOperatorType] < precedence) {
            break;
        }

        tokenCount++;
        tokens = tokens.slice(1);

        const [right, rightTokenCount] = parseBinaryExpression(tokens, binaryOperatorPrecedence[binaryOperatorType] + (binaryOperatorAssociativity[binaryOperatorType] === 'left' ? 1 : 0));
        tokenCount += rightTokenCount;
        tokens = tokens.slice(rightTokenCount);

        result = {
            type: binaryOperatorType,
            left: result,
            right,
            location: result.location
        }
    }

    return [result, tokenCount];
}

function parsePrimitiveExpression(tokens: Token[]): [PrimitiveExpression, number] {
    // Parse integer literal
    {
        const [match, tokenCount] = matchPattern(tokens, [
            { type: 'integer-literal' }
        ]);
        if (match !== null) {
            const [integerLiteralToken] = match;

            return [{
                type: 'integer-literal',
                value: integerLiteralToken.value,
                location: integerLiteralToken.location
            }, tokenCount];
        }
    }

    // Parse float literal
    {
        const [match, tokenCount] = matchPattern(tokens, [
            { type: 'float-literal' }
        ]);
        if (match !== null) {
            const [floatLiteralToken] = match;

            return [{
                type: 'float-literal',
                value: floatLiteralToken.value,
                location: floatLiteralToken.location
            }, tokenCount];
        }
    }

    // Parse string literal
    {
        const [match, tokenCount] = matchPattern(tokens, [
            { type: 'string-literal' }
        ]);
        if (match !== null) {
            const [stringLiteralToken] = match;

            return [{
                type: 'string-literal',
                value: stringLiteralToken.value,
                location: stringLiteralToken.location
            }, tokenCount];
        }
    }

    // Parse variable
    {
        const [match, tokenCount] = matchPattern(tokens, [
            { type: 'identifier' }
        ]);
        if (match !== null) {
            const [identifierToken] = match;

            return [{
                type: 'variable',
                identifier: identifierToken.value,
                location: identifierToken.location
            }, tokenCount];
        }
    }

    // Parse sub-expression
    {
        const [match, tokenCount] = matchPattern(tokens, [
            { type: 'symbol', value: '(' },
            { type: 'expression' },
            { type: 'symbol', value: ')' }
        ]);
        if (match !== null) {
            const [
                openParenthesisToken,
                expression,
                closeParenthesisToken
            ] = match;

            return [{
                type: 'sub-expression',
                expression,
                location: expression.location
            }, tokenCount];
        }
    }

    throw new InputError(['Expected expression'], tokens[0].location);
}

type Pattern<T extends Token | { type: 'expression' }> = ({
    [K in keyof T as K extends 'type' | 'value' ? K : never]?: T[K] | T[K][];
} & {
    optional?: boolean;
});

function matchPattern<T extends Pattern<Token | { type: 'expression' }>[]>(tokens: Token[], pattern: [...T]): [{ [K in keyof T]: T[K]['type'] extends 'expression' ? Expression : Extract<Token, { type: T[K]['type'] }> | (T[K]['optional'] extends true ? null : never) } | null, number] {
    const match: any = [];

    let tokenIndex = 0;
    for (let patternIndex = 0; patternIndex < pattern.length; patternIndex++) {
        if (tokenIndex >= tokens.length) {
            return [null, 0];
        }

        const token = tokens[tokenIndex];
        const patternToken = pattern[patternIndex];

        if (patternToken.type === 'expression') {
            const [expression, tokenCount] = parseExpression(tokens.slice(tokenIndex));

            match.push(expression);
            tokenIndex += tokenCount;
            continue;
        }

        if ((patternToken.type !== undefined && token.type !== patternToken.type) || ('value' in patternToken && patternToken.value !== undefined && token.value !== patternToken.value)) {
            if (patternToken.optional) {
                match.push(null);
                continue;
            }

            return [null, 0];
        }

        match.push(token);
        tokenIndex++;
    }

    return [match, tokenIndex];
}

