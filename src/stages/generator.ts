import { Statement, Expression } from '@/stages/parser';
import { InputError } from '@/errors';
import exhaust from '@/exhaust';
import log from '@/log';

const primitiveTypes = [
    { identifier: 'i8', size: 1 },
    { identifier: 'u8', size: 1 },
    { identifier: 'i16', size: 2 },
    { identifier: 'u16', size: 2 },
    { identifier: 'i32', size: 4 },
    { identifier: 'u32', size: 4 }
] as const;

type Variable = {
    typeIdentifier: string;
    variableIdentifier: string;
    const: boolean;
    offset: number;
}

export type Assembly = {
    code: Buffer;
}

class DynamicBuffer {
    private readonly chunkSize = 256;

    private data: Buffer;
    private size: number;

    constructor() {
        this.data = Buffer.alloc(this.chunkSize);
        this.size = 0;
    }

    write(buffer: Buffer) {
        while (this.data.length < this.size + buffer.length) {
            this.data = Buffer.concat([this.data, Buffer.alloc(this.chunkSize)]);
        }

        buffer.copy(this.data, this.size, 0, buffer.length);
        this.size += buffer.length;
    }

    get buffer() {
        return this.data.subarray(0, this.size);
    }

    get length() {
        return this.size;
    }
}

export default function generate(statements: Statement[]): Assembly {
    const globalStackFrameSize = calculateStackFrameSize(statements);

    const code = new DynamicBuffer();

    generateStatements(statements, globalStackFrameSize, [], 0, code);

    return { code: code.buffer }
}

function generateStatements(statements: Statement[], globalStackFrameSize: number, externalVariables: Variable[], stackOffset: number, buffer: DynamicBuffer): { stackOffset: number } {
    const variables: Variable[] = [];

    statements.forEach((statement) => {
        const type = statement.type;
        switch (type) {
            case 'declaration':
            case 'declaration-with-assignment': {
                if (!primitiveTypes.some((type) => type.identifier === statement.typeIdentifier)) {
                    throw new InputError(['Invalid type identifier: ', { value: statement.typeIdentifier, bold: true }], statement.location);
                }

                if (variables.some((variable) => variable.variableIdentifier === statement.variableIdentifier)) {
                    throw new InputError(['Variable ', { value: statement.variableIdentifier, bold: true }, ' is already declared'], statement.location);
                }

                // W-Shadow
                if (externalVariables.some((variable) => variable.variableIdentifier === statement.variableIdentifier)) {
                    log('WARN', ['Variable ', { value: statement.variableIdentifier, bold: true }, ' shadows a previously declared variable'], statement.location);
                }

                if (statement.type === 'declaration' && statement.const) {
                    throw new InputError(['Cannot declare a constant without an assignment'], statement.location);
                }

                variables.push({
                    typeIdentifier: statement.typeIdentifier,
                    variableIdentifier: statement.variableIdentifier,
                    const: statement.const,
                    offset: stackOffset
                });

                if (statement.type === 'declaration-with-assignment') {
                    buffer.write(Buffer.from('; EVAL EXPRESSION\n'));
                    generateExpression(statement.assignment, globalStackFrameSize, [...variables, ...externalVariables], stackOffset, buffer);
                    buffer.write(Buffer.from(`> STACK[${stackOffset}]\n`));
                }

                stackOffset += primitiveTypes.find((type) => type.identifier === statement.typeIdentifier)?.size ?? 0;
            } break;
            case 'assignment': {
                const variable = variables.find((variable) => variable.variableIdentifier === statement.variableIdentifier) ??
                    externalVariables.find((variable) => variable.variableIdentifier === statement.variableIdentifier) ?? null;

                if (variable === null) {
                    throw new InputError(['Variable ', { value: statement.variableIdentifier, bold: true }, ' is not declared'], statement.location);
                }

                if (variable.const) {
                    throw new InputError(['Cannot assign to a constant variable'], statement.location);
                }

                buffer.write(Buffer.from('; EVAL EXPRESSION\n'));
                generateExpression(statement.assignment, globalStackFrameSize, [...variables, ...externalVariables], stackOffset, buffer);
                buffer.write(Buffer.from(`> STACK[${variable.offset}]\n`));
            } break;
            case 'increment':
            case 'decrement': {
                const variable = variables.find((variable) => variable.variableIdentifier === statement.variableIdentifier) ??
                    externalVariables.find((variable) => variable.variableIdentifier === statement.variableIdentifier) ?? null;

                if (variable === null) {
                    throw new InputError(['Variable ', { value: statement.variableIdentifier, bold: true }, ' is not declared'], statement.location);
                }

                if (variable.const) {
                    throw new InputError(['Cannot modify a constant variable'], statement.location);
                }

                // TODO: Check if variable type is number

                buffer.write(Buffer.from(`STACK[${variable.offset}]${statement.type === 'increment' ? '++' : '--'}\n`));
            } break;
            case 'function-call': {
                throw new Error('Not implemented');
            } break;
            case 'scope': {
                buffer.write(Buffer.from('; BEGIN SCOPE\n'));
                ({ stackOffset } = generateStatements(statement.statements, globalStackFrameSize, [...variables, ...externalVariables], stackOffset, buffer));
                buffer.write(Buffer.from('; END SCOPE\n'));
            } break;
            case 'if': {
                statement.blocks.forEach((block) => {
                    buffer.write(Buffer.from('; BEGIN IF COND\n'));
                    buffer.write(Buffer.from('; EVAL EXPRESSION\n'));
                    generateExpression(block.condition, globalStackFrameSize, [...variables, ...externalVariables], stackOffset, buffer);
                    buffer.write(Buffer.from('JMP IF TRUE ??\n'));
                    buffer.write(Buffer.from('; END IF COND\n'));
                });

                buffer.write(Buffer.from('; BEGIN ELSE COND\n'));
                buffer.write(Buffer.from('JMP ??\n'));
                buffer.write(Buffer.from('; END ELSE COND\n'));

                const jumpLocations: number[] = [];

                statement.blocks.map((block) => block.statements).forEach((block) => {
                    jumpLocations.push(buffer.length);
                    buffer.write(Buffer.from('; BEGIN IF BLOCK\n'));
                    ({ stackOffset } = generateStatements(block, globalStackFrameSize, [...variables, ...externalVariables], stackOffset, buffer));
                    buffer.write(Buffer.from('; END IF BLOCK\n'));
                });

                const elseJumpLocation = buffer.length;

                if (statement.elseBlock !== null) {
                    buffer.write(Buffer.from('; BEGIN ELSE BLOCK\n'));
                    ({ stackOffset } = generateStatements(statement.elseBlock, globalStackFrameSize, [...variables, ...externalVariables], stackOffset, buffer));
                    buffer.write(Buffer.from('; END ELSE BLOCK\n'));
                }

                buffer.write(Buffer.from(`-> FILL IF BLOCK JMP: ${jumpLocations.join(', ')}\n`));
                buffer.write(Buffer.from(`-> FILL ELSE BLOCK JMP: ${elseJumpLocation}\n`));
            } break;
            case 'while': {
                const beforeByteOffset = buffer.length;

                if (!statement.doWhile) {
                    buffer.write(Buffer.from('; BEGIN WHILE COND\n'));
                    buffer.write(Buffer.from('; EVAL EXPRESSION\n'));
                    generateExpression(statement.condition, globalStackFrameSize, [...variables, ...externalVariables], stackOffset, buffer);
                    buffer.write(Buffer.from('JMP IF FALSE ??\n'));
                    buffer.write(Buffer.from('; END WHILE COND\n'));
                }

                buffer.write(Buffer.from('; BEGIN WHILE BLOCK\n'));
                ({ stackOffset } = generateStatements(statement.statements, globalStackFrameSize, [...variables, ...externalVariables], stackOffset, buffer));
                buffer.write(Buffer.from('; END WHILE BLOCK\n'));

                if (!statement.doWhile) {
                    buffer.write(Buffer.from(`JMP ${beforeByteOffset}\n`));
                    buffer.write(Buffer.from(`-> FILL WHILE JMP: ${buffer.length}\n`));
                } else {
                    buffer.write(Buffer.from('; BEGIN WHILE COND\n'));
                    buffer.write(Buffer.from('; EVAL EXPRESSION\n'));
                    generateExpression(statement.condition, globalStackFrameSize, [...variables, ...externalVariables], stackOffset, buffer);
                    buffer.write(Buffer.from(`JMP IF TRUE ${beforeByteOffset}\n`));
                    buffer.write(Buffer.from('; END WHILE COND\n'));
                }
            } break;
            case 'for': {

                if (statement.initialization !== null) {
                    // TODO: Initialization must be in the same scope as the for loop, gl with that

                    buffer.write(Buffer.from('; BEGIN FOR INIT\n'));
                    ({ stackOffset } = generateStatements([statement.initialization], globalStackFrameSize, [...variables, ...externalVariables], stackOffset, buffer));
                    buffer.write(Buffer.from('; END FOR INIT\n'));
                }

                const beforeByteOffset = buffer.length;

                if (statement.condition !== null) {
                    buffer.write(Buffer.from('; BEGIN FOR COND\n'));
                    buffer.write(Buffer.from('; EVAL EXPRESSION\n'));
                    generateExpression(statement.condition, globalStackFrameSize, [...variables, ...externalVariables], stackOffset, buffer);
                    buffer.write(Buffer.from('JMP IF FALSE ??\n'));
                    buffer.write(Buffer.from('; END FOR COND\n'));
                }

                buffer.write(Buffer.from('; BEGIN FOR BLOCK\n'));
                ({ stackOffset } = generateStatements(statement.statements, globalStackFrameSize, [...variables, ...externalVariables], stackOffset, buffer));
                buffer.write(Buffer.from('; END FOR BLOCK\n'));

                if (statement.action !== null) {
                    // TODO: Again, must be in the same scope as the for block

                    buffer.write(Buffer.from('; BEGIN FOR ACTION\n'));
                    ({ stackOffset } = generateStatements([statement.action], globalStackFrameSize, [...variables, ...externalVariables], stackOffset, buffer));
                    buffer.write(Buffer.from('; END FOR ACTION\n'));
                }

                buffer.write(Buffer.from(`JMP ${beforeByteOffset}\n`));
                buffer.write(Buffer.from(`-> FILL FOR JMP: ${buffer.length}\n`));
            } break;
            case 'continue':
            case 'break':
            case 'function-declaration':
            case 'return': {
                throw new Error('Not implemented');
            } break;
            default: {
                exhaust(type);
            } break;
        }
    });

    return { stackOffset };
}

function generateExpression(expression: Expression, globalStackFrameSize: number, externalVariables: Variable[], stackOffset: number, buffer: DynamicBuffer): void {
    const type = expression.type;
    switch (type) {
        case 'integer-literal': {
            buffer.write(Buffer.from(`< LITERAL INT ${expression.value}\n`));
        } break;
        case 'float-literal': {
            buffer.write(Buffer.from(`< LITERAL FLOAT ${expression.value}\n`));
        } break;
        case 'string-literal': {
            buffer.write(Buffer.from(`< LITERAL STRING ${expression.value}\n`));
        } break;
        case 'variable': {
            const variable = externalVariables.find((variable) => variable.variableIdentifier === expression.identifier) ??
                null;

            if (variable === null) {
                throw new InputError(['Variable ', { value: expression.identifier, bold: true }, ' is not declared'], expression.location);
            }

            buffer.write(Buffer.from(`< STACK[${variable.offset}]\n`));
        } break;
        case 'increment':
        case 'decrement': {
            const variable = externalVariables.find((variable) => variable.variableIdentifier === expression.identifier) ??
                null;

            if (variable === null) {
                throw new InputError(['Variable ', { value: expression.identifier, bold: true }, ' is not declared'], expression.location);
            }

            buffer.write(Buffer.from(`< STACK[${variable.offset}]${expression.type === 'increment' ? '++' : '--'}\n`));
        } break;
        case 'sub-expression': {
            buffer.write(Buffer.from('; EVAL SUBEXPRESSION\n'));
            generateExpression(expression.expression, globalStackFrameSize, externalVariables, stackOffset, buffer);
        } break;
        case 'function-call': {
            throw new Error('Not implemented');
        } break;
        case 'addition':
        case 'subtraction':
        case 'multiplication':
        case 'division':
        case 'modulo':
        case 'bitwise-or':
        case 'bitwise-and':
        case 'equality':
        case 'inequality':
        case 'less-than':
        case 'less-than-or-equal':
        case 'greater-than':
        case 'greater-than-or-equal': {
            buffer.write(Buffer.from('; EVAL A\n'));
            generateExpression(expression.left, globalStackFrameSize, externalVariables, stackOffset, buffer);
            buffer.write(Buffer.from('; EVAL B\n'));
            generateExpression(expression.right, globalStackFrameSize, externalVariables, stackOffset, buffer);
            buffer.write(Buffer.from(`< A {${expression.type}} B\n`));
        } break;
        default: {
            exhaust(type);
        } break;
    }
}

function calculateStackFrameSize(statements: Statement[]): number {
    let stackFrameSize = 0;

    statements.forEach((statement) => {
        switch (statement.type) {
            case 'declaration':
            case 'declaration-with-assignment': {
                stackFrameSize += primitiveTypes.find((type) => type.identifier === statement.typeIdentifier)?.size ?? 0;
            } break;
            case 'scope':
            case 'if':
            case 'while':
            case 'for': {
                const statements = statement.type === 'scope' ? statement.statements :
                    statement.type === 'if' ? [...statement.blocks.map((block) => block.statements), statement.elseBlock ?? []].flat() :
                        statement.statements;

                stackFrameSize += calculateStackFrameSize(statements);
            } break;
        }
    });

    return stackFrameSize;
}
