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

export type Target = 'debug';

type State = {
    stackOffset: number;
    outputBuffer: DynamicBuffer;
    target: Target;
}

export default function generate(statements: Statement[], target: Target): Assembly {
    const state: State = {
        stackOffset: 0,
        outputBuffer: new DynamicBuffer(),
        target
    }

    generateStatements(statements, [], state);

    return { code: state.outputBuffer.buffer }
}

function generateStatements(statements: Statement[], inheritedVariables: Variable[], state: State): Variable[] {
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
                if (inheritedVariables.some((variable) => variable.variableIdentifier === statement.variableIdentifier)) {
                    log('WARN', ['Variable ', { value: statement.variableIdentifier, bold: true }, ' shadows a previously declared variable'], statement.location);
                }

                if (statement.type === 'declaration' && statement.const) {
                    throw new InputError(['Cannot declare a constant without an assignment'], statement.location);
                }

                variables.push({
                    typeIdentifier: statement.typeIdentifier,
                    variableIdentifier: statement.variableIdentifier,
                    const: statement.const,
                    offset: state.stackOffset
                });

                if (statement.type === 'declaration-with-assignment') {
                    state.outputBuffer.write(Buffer.from('(\n'));
                    generateExpression(statement.assignment, [...variables, ...inheritedVariables], state);
                    state.outputBuffer.write(Buffer.from(`) > STACK[${state.stackOffset}]\n`));
                }

                state.stackOffset += primitiveTypes.find((type) => type.identifier === statement.typeIdentifier)?.size ?? 0;
            } break;
            case 'assignment': {
                const variable = variables.find((variable) => variable.variableIdentifier === statement.variableIdentifier) ??
                    inheritedVariables.find((variable) => variable.variableIdentifier === statement.variableIdentifier) ?? null;

                if (variable === null) {
                    throw new InputError(['Variable ', { value: statement.variableIdentifier, bold: true }, ' is not declared'], statement.location);
                }

                if (variable.const) {
                    throw new InputError(['Cannot assign to a constant variable'], statement.location);
                }

                state.outputBuffer.write(Buffer.from('(\n'));
                generateExpression(statement.assignment, [...variables, ...inheritedVariables], state);
                state.outputBuffer.write(Buffer.from(`) > STACK[${variable.offset}]\n`));
            } break;
            case 'increment':
            case 'decrement': {
                const variable = variables.find((variable) => variable.variableIdentifier === statement.variableIdentifier) ??
                    inheritedVariables.find((variable) => variable.variableIdentifier === statement.variableIdentifier) ?? null;

                if (variable === null) {
                    throw new InputError(['Variable ', { value: statement.variableIdentifier, bold: true }, ' is not declared'], statement.location);
                }

                if (variable.const) {
                    throw new InputError(['Cannot modify a constant variable'], statement.location);
                }

                // TODO: Check if variable type is number

                state.outputBuffer.write(Buffer.from(`STACK[${variable.offset}]${statement.type === 'increment' ? '++' : '--'}\n`));
            } break;
            case 'function-call': {
                throw new Error('Not implemented');
            } break;
            case 'scope': {
                state.outputBuffer.write(Buffer.from('{\n'));
                generateStatements(statement.statements, [...variables, ...inheritedVariables], state);
                state.outputBuffer.write(Buffer.from('}\n'));
            } break;
            case 'if': {
                statement.blocks.forEach((block) => {
                    state.outputBuffer.write(Buffer.from('(\n'));
                    generateExpression(block.condition, [...variables, ...inheritedVariables], state);
                    state.outputBuffer.write(Buffer.from(') JMP IF TRUE ??\n'));
                });

                state.outputBuffer.write(Buffer.from('JMP ??\n'));

                const jumpLocations: number[] = [];

                statement.blocks.map((block) => block.statements).forEach((block) => {
                    jumpLocations.push(state.outputBuffer.length);
                    state.outputBuffer.write(Buffer.from('{\n'));
                    generateStatements(block, [...variables, ...inheritedVariables], state);
                    state.outputBuffer.write(Buffer.from('}\n'));
                    state.outputBuffer.write(Buffer.from('JMP ??\n'));
                });

                const elseJumpLocation = state.outputBuffer.length;

                if (statement.elseBlock !== null) {
                    state.outputBuffer.write(Buffer.from('{\n'));
                    generateStatements(statement.elseBlock, [...variables, ...inheritedVariables], state);
                    state.outputBuffer.write(Buffer.from('}\n'));
                }

                const endJumpLocation = state.outputBuffer.length;

                state.outputBuffer.write(Buffer.from(`; FILL JMPS: ${jumpLocations.join(', ')}\n`));
                state.outputBuffer.write(Buffer.from(`; FILL JMP: ${elseJumpLocation}\n`));
                state.outputBuffer.write(Buffer.from(`; FILL JMPS: ${new Array(statement.blocks.length).fill(endJumpLocation).join(', ')}\n`));
            } break;
            case 'while': {
                const beforeByteOffset = state.outputBuffer.length;

                if (!statement.doWhile) {
                    state.outputBuffer.write(Buffer.from('(\n'));
                    generateExpression(statement.condition, [...variables, ...inheritedVariables], state);
                    state.outputBuffer.write(Buffer.from(') JMP IF FALSE ??\n'));
                }

                state.outputBuffer.write(Buffer.from('{\n'));
                generateStatements(statement.statements, [...variables, ...inheritedVariables], state);
                state.outputBuffer.write(Buffer.from('}\n'));

                if (!statement.doWhile) {
                    state.outputBuffer.write(Buffer.from(`JMP ${beforeByteOffset}\n`));
                    state.outputBuffer.write(Buffer.from(`; FILL JMP: ${state.outputBuffer.length}\n`));
                } else {
                    state.outputBuffer.write(Buffer.from('(\n'));
                    generateExpression(statement.condition, [...variables, ...inheritedVariables], state);
                    state.outputBuffer.write(Buffer.from(`) JMP IF TRUE ${beforeByteOffset}\n`));
                }
            } break;
            case 'for': {
                const initializationVariables = [];

                if (statement.initialization !== null) {
                    state.outputBuffer.write(Buffer.from('{\n'));
                    initializationVariables.push(...generateStatements([statement.initialization], [...variables, ...inheritedVariables], state));
                    state.outputBuffer.write(Buffer.from('}\n'));
                }

                state.outputBuffer.write(Buffer.from('JMP ??\n'));

                const beforeByteOffset = state.outputBuffer.length;

                const actionVariables = [];

                if (statement.action !== null) {
                    state.outputBuffer.write(Buffer.from('{\n'));
                    actionVariables.push(...generateStatements([statement.action], [...initializationVariables, ...variables, ...inheritedVariables], state));
                    state.outputBuffer.write(Buffer.from('}\n'));
                }

                state.outputBuffer.write(Buffer.from(`; FILL JMP: ${state.outputBuffer.length}\n`));

                if (statement.condition !== null) {
                    state.outputBuffer.write(Buffer.from('(\n'));
                    generateExpression(statement.condition, [...initializationVariables, ...variables, ...inheritedVariables], state);
                    state.outputBuffer.write(Buffer.from(') JMP IF FALSE ??\n'));
                }

                state.outputBuffer.write(Buffer.from('{\n'));
                generateStatements(statement.statements, [...actionVariables, ...initializationVariables, ...variables, ...inheritedVariables], state);
                state.outputBuffer.write(Buffer.from('}\n'));

                state.outputBuffer.write(Buffer.from(`JMP ${beforeByteOffset}\n`));
                if (statement.condition !== null) {
                    state.outputBuffer.write(Buffer.from(`; FILL JMP: ${state.outputBuffer.length}\n`));
                }
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

    return variables;
}

function generateExpression(expression: Expression, inheritedVariables: Variable[], state: State): void {
    const type = expression.type;
    switch (type) {
        case 'integer-literal': {
            state.outputBuffer.write(Buffer.from(`LITERAL INT: ${expression.value}\n`));
        } break;
        case 'float-literal': {
            state.outputBuffer.write(Buffer.from(`LITERAL FLOAT: ${expression.value}\n`));
        } break;
        case 'string-literal': {
            state.outputBuffer.write(Buffer.from(`LITERAL STRING: ${expression.value}\n`));
        } break;
        case 'variable': {
            const variable = inheritedVariables.find((variable) => variable.variableIdentifier === expression.identifier) ?? null;

            if (variable === null) {
                throw new InputError(['Variable ', { value: expression.identifier, bold: true }, ' is not declared'], expression.location);
            }

            state.outputBuffer.write(Buffer.from(`STACK[${variable.offset}]\n`));
        } break;
        case 'increment':
        case 'decrement': {
            const variable = inheritedVariables.find((variable) => variable.variableIdentifier === expression.identifier) ??
                null;

            if (variable === null) {
                throw new InputError(['Variable ', { value: expression.identifier, bold: true }, ' is not declared'], expression.location);
            }

            state.outputBuffer.write(Buffer.from(`STACK[${variable.offset}]${expression.type === 'increment' ? '++' : '--'}\n`));
        } break;
        case 'sub-expression': {
            state.outputBuffer.write(Buffer.from('(\n'));
            generateExpression(expression.expression, inheritedVariables, state);
            state.outputBuffer.write(Buffer.from(')\n'));
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
            state.outputBuffer.write(Buffer.from('(\n'));
            generateExpression(expression.left, inheritedVariables, state);
            state.outputBuffer.write(Buffer.from(`) ${expression.type} (\n`));
            generateExpression(expression.right, inheritedVariables, state);
            state.outputBuffer.write(Buffer.from(')\n'));
        } break;
        default: {
            exhaust(type);
        } break;
    }
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
