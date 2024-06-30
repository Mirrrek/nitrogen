import { Token, LocalizedToken } from '@/stages/tokenizer';
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

export type IncrementStatement = {
    type: 'increment';
    variableIdentifier: string;
    location: Location;
}

export type DecrementStatement = {
    type: 'decrement';
    variableIdentifier: string;
    location: Location;
}

export type FunctionCallStatement = {
    type: 'function-call';
    functionIdentifier: string;
    arguments: Expression[];
    location: Location;
}

export type ScopeStatement = {
    type: 'scope';
    statements: Statement[];
    location: Location;
}

export type Statement = DeclarationStatement |
    DeclarationWithAssignmentStatement |
    AssignmentStatement |
    IncrementStatement |
    DecrementStatement |
    FunctionCallStatement |
    ScopeStatement;

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

export type IncrementPrimitiveExpression = {
    type: 'increment';
    identifier: string;
    location: Location;
}

export type DecrementPrimitiveExpression = {
    type: 'decrement';
    identifier: string;
    location: Location;
}

export type SubExpressionPrimitiveExpression = {
    type: 'sub-expression';
    expression: Expression;
    location: Location;
}

export type FunctionCallPrimitiveExpression = {
    type: 'function-call';
    functionIdentifier: string;
    arguments: Expression[];
    location: Location;
}

export type PrimitiveExpression = IntegerLiteralPrimitiveExpression |
    FloatLiteralPrimitiveExpression |
    StringLiteralPrimitiveExpression |
    VariablePrimitiveExpression |
    IncrementPrimitiveExpression |
    DecrementPrimitiveExpression |
    SubExpressionPrimitiveExpression |
    FunctionCallPrimitiveExpression;

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

export type ModuloBinaryExpression = {
    type: 'modulo';
    left: Expression;
    right: Expression;
    location: Location;
}

export type BitwiseOrBinaryExpression = {
    type: 'bitwise-or';
    left: Expression;
    right: Expression;
    location: Location;
}

export type BitwiseAndBinaryExpression = {
    type: 'bitwise-and';
    left: Expression;
    right: Expression;
    location: Location;
}

export type EqualityBinaryExpression = {
    type: 'equality';
    left: Expression;
    right: Expression;
    location: Location;
}

export type InequalityBinaryExpression = {
    type: 'inequality';
    left: Expression;
    right: Expression;
    location: Location;
}

export type LessThanBinaryExpression = {
    type: 'less-than';
    left: Expression;
    right: Expression;
    location: Location;
}

export type LessThanOrEqualBinaryExpression = {
    type: 'less-than-or-equal';
    left: Expression;
    right: Expression;
    location: Location;
}

export type GreaterThanBinaryExpression = {
    type: 'greater-than';
    left: Expression;
    right: Expression;
    location: Location;
}

export type GreaterThanOrEqualBinaryExpression = {
    type: 'greater-than-or-equal';
    left: Expression;
    right: Expression;
    location: Location;
}

export type BinaryExpression = AdditionBinaryExpression |
    SubtractionBinaryExpression |
    MultiplicationBinaryExpression |
    DivisionBinaryExpression |
    ModuloBinaryExpression |
    BitwiseOrBinaryExpression |
    BitwiseAndBinaryExpression |
    EqualityBinaryExpression |
    InequalityBinaryExpression |
    LessThanBinaryExpression |
    LessThanOrEqualBinaryExpression |
    GreaterThanBinaryExpression |
    GreaterThanOrEqualBinaryExpression;

export type Expression = PrimitiveExpression | BinaryExpression;

const binaryOperators: { [K in BinaryExpression['type']]: Extract<LocalizedToken, { type: 'symbol' }>['value'] } = {
    'addition': '+',
    'subtraction': '-',
    'multiplication': '*',
    'division': '/',
    'modulo': '%',
    'bitwise-or': '|',
    'bitwise-and': '&',
    'equality': '==',
    'inequality': '!=',
    'less-than': '<',
    'less-than-or-equal': '<=',
    'greater-than': '>',
    'greater-than-or-equal': '>='
}

const binaryOperatorPrecedence: { [K in BinaryExpression['type']]: number } = {
    'equality': 0,
    'inequality': 0,
    'less-than': 0,
    'less-than-or-equal': 0,
    'greater-than': 0,
    'greater-than-or-equal': 0,
    'bitwise-or': 1,
    'bitwise-and': 2,
    'addition': 3,
    'subtraction': 3,
    'multiplication': 4,
    'division': 4,
    'modulo': 4
}

const binaryOperatorAssociativity: { [K in BinaryExpression['type']]: 'left' | 'right' } = {
    'addition': 'left',
    'subtraction': 'left',
    'multiplication': 'left',
    'division': 'left',
    'modulo': 'left',
    'bitwise-or': 'left',
    'bitwise-and': 'left',
    'equality': 'left',
    'inequality': 'left',
    'less-than': 'left',
    'less-than-or-equal': 'left',
    'greater-than': 'left',
    'greater-than-or-equal': 'left'
}

export default function parse(tokens: LocalizedToken[]): Statement[] {
    const statements: Statement[] = [];

    while (tokens.length > 0) {
        const [statement, tokenCount] = parseStatement(tokens);
        statements.push(statement);
        tokens = tokens.slice(tokenCount);
    }

    return statements;
}

function parseStatement(tokens: LocalizedToken[]): [Statement, number] {
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

            return [{
                type: 'declaration',
                typeIdentifier: typeIdentifierToken.value,
                variableIdentifier: variableIdentifierToken.value,
                const: constToken !== null,
                location: constToken?.location ?? typeIdentifierToken.location
            }, tokenCount];
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

            return [{
                type: 'declaration-with-assignment',
                typeIdentifier: typeIdentifierToken.value,
                variableIdentifier: variableIdentifierToken.value,
                const: constToken !== null,
                assignment,
                location: constToken?.location ?? typeIdentifierToken.location
            }, tokenCount];
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

            return [{
                type: 'assignment',
                variableIdentifier: variableIdentifierToken.value,
                assignment,
                location: variableIdentifierToken.location
            }, tokenCount];
        }
    }

    // Parse increment
    {
        const [match, tokenCount] = matchPattern(tokens, [
            { type: 'identifier' },
            { type: 'symbol', value: '++' },
            { type: 'symbol', value: ';' }
        ]);
        if (match !== null) {
            const [
                variableIdentifierToken,
                incrementToken,
                semicolonToken
            ] = match;

            return [{
                type: 'increment',
                variableIdentifier: variableIdentifierToken.value,
                location: variableIdentifierToken.location
            }, tokenCount];
        }
    }

    // Parse decrement
    {
        const [match, tokenCount] = matchPattern(tokens, [
            { type: 'identifier' },
            { type: 'symbol', value: '--' },
            { type: 'symbol', value: ';' }
        ]);
        if (match !== null) {
            const [
                variableIdentifierToken,
                decrementToken,
                semicolonToken
            ] = match;

            return [{
                type: 'decrement',
                variableIdentifier: variableIdentifierToken.value,
                location: variableIdentifierToken.location
            }, tokenCount];
        }
    }

    // Parse function call
    {
        const [match, tokenCount] = matchPattern(tokens, [
            { type: 'identifier' },
            { type: 'symbol', value: '(' },
            { type: 'arguments' },
            { type: 'symbol', value: ')' },
            { type: 'symbol', value: ';' }
        ]);
        if (match !== null) {
            const [
                functionIdentifierToken,
                openParenthesisToken,
                argumentExpressions,
                closeParenthesisToken,
                semicolonToken
            ] = match;

            return [{
                type: 'function-call',
                functionIdentifier: functionIdentifierToken.value,
                arguments: argumentExpressions,
                location: functionIdentifierToken.location
            }, tokenCount];
        }
    }

    // Parse scope
    {
        const [match, tokenCount] = matchPattern(tokens, [
            { type: 'symbol', value: '{' },
            { type: 'statements' },
            { type: 'symbol', value: '}' }
        ]);
        if (match !== null) {
            const [
                openBraceToken,
                scopeStatements,
                closeBraceToken
            ] = match;

            return [{
                type: 'scope',
                statements: scopeStatements,
                location: openBraceToken.location
            }, tokenCount];
        }
    }

    throw new InputError(['Invalid statement'], tokens[0].location);
}

function parseExpression(tokens: LocalizedToken[]): [Expression, number] {
    return parseBinaryExpression(tokens, 0);
}

function parseBinaryExpression(tokens: LocalizedToken[], precedence: number): [Expression, number] {
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

function parsePrimitiveExpression(tokens: LocalizedToken[]): [PrimitiveExpression, number] {
    // Parse integer literal
    {
        const [match, tokenCount] = matchPattern(tokens, [
            { type: 'symbol', value: '-', optional: true },
            { type: 'integer-literal' }
        ]);
        if (match !== null) {
            const [
                minusToken,
                integerLiteralToken
            ] = match;

            return [{
                type: 'integer-literal',
                value: integerLiteralToken.value * (minusToken === null ? 1 : -1),
                location: integerLiteralToken.location
            }, tokenCount];
        }
    }

    // Parse float literal
    {
        const [match, tokenCount] = matchPattern(tokens, [
            { type: 'symbol', value: '-', optional: true },
            { type: 'float-literal' }
        ]);
        if (match !== null) {
            const [
                minusToken,
                floatLiteralToken
            ] = match;

            return [{
                type: 'float-literal',
                value: floatLiteralToken.value * (minusToken === null ? 1 : -1),
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
            const [
                stringLiteralToken
            ] = match;

            return [{
                type: 'string-literal',
                value: stringLiteralToken.value,
                location: stringLiteralToken.location
            }, tokenCount];
        }
    }

    // Parse function call
    {
        const [match, tokenCount] = matchPattern(tokens, [
            { type: 'identifier' },
            { type: 'symbol', value: '(' },
            { type: 'arguments' },
            { type: 'symbol', value: ')' }
        ]);
        if (match !== null) {
            const [
                functionIdentifierToken,
                openParenthesisToken,
                argumentExpressions,
                closeParenthesisToken
            ] = match;

            return [{
                type: 'function-call',
                functionIdentifier: functionIdentifierToken.value,
                arguments: argumentExpressions,
                location: functionIdentifierToken.location
            }, tokenCount];
        }
    }

    // Parse increment
    {
        const [match, tokenCount] = matchPattern(tokens, [
            { type: 'identifier' },
            { type: 'symbol', value: '++' }
        ]);
        if (match !== null) {
            const [
                identifierToken,
                incrementToken
            ] = match;

            return [{
                type: 'increment',
                identifier: identifierToken.value,
                location: identifierToken.location
            }, tokenCount];
        }
    }

    // Parse decrement
    {
        const [match, tokenCount] = matchPattern(tokens, [
            { type: 'identifier' },
            { type: 'symbol', value: '--' }
        ]);
        if (match !== null) {
            const [
                identifierToken,
                decrementToken
            ] = match;

            return [{
                type: 'decrement',
                identifier: identifierToken.value,
                location: identifierToken.location
            }, tokenCount];
        }
    }

    // Parse variable
    {
        const [match, tokenCount] = matchPattern(tokens, [
            { type: 'identifier' }
        ]);
        if (match !== null) {
            const [
                identifierToken
            ] = match;

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

    throw new InputError(['Invalid expression'], tokens[0].location);
}

type Pattern<T extends LocalizedToken | { type: 'expression' } | { type: 'arguments' } | { type: 'statements' } = LocalizedToken | { type: 'expression' } | { type: 'arguments' } | { type: 'statements' }> = ({
    [K in keyof T as K extends 'type' | 'value' ? K : never]?: T[K] | T[K][];
} & {
    optional?: boolean;
});

function matchPattern<T extends Pattern[]>(tokens: LocalizedToken[], pattern: [...T]): [{ [K in keyof T]: T[K]['type'] extends 'expression' ? Expression : T[K]['type'] extends 'arguments' ? Expression[] : T[K]['type'] extends 'statements' ? Statement[] : (Extract<LocalizedToken, { type: T[K]['type'] }> | (T[K]['optional'] extends true ? null : never)) } | null, number] {
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

        if (patternToken.type === 'arguments') {
            const expressions: Expression[] = [];

            do {
                try {
                    const [expression, tokenCount] = parseExpression(tokens.slice(tokenIndex));
                    expressions.push(expression);
                    tokenIndex += tokenCount;
                } catch (e) {
                    break;
                }

                if (tokenIndex >= tokens.length) {
                    return [null, 0];
                }
            } while (tokens[tokenIndex].type === 'symbol' && tokens[tokenIndex].value === ',' && tokenIndex++);

            match.push(expressions);
            continue;
        }

        if (patternToken.type === 'statements') {
            const statements: Statement[] = [];

            while (true) {
                try {
                    const [statement, tokenCount] = parseStatement(tokens.slice(tokenIndex));
                    statements.push(statement);
                    tokenIndex += tokenCount;
                } catch (e) {
                    break;
                }

                if (tokenIndex >= tokens.length) {
                    return [null, 0];
                }
            }

            match.push(statements);
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

