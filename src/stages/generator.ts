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
    outputBuffer: OutputBuffer;
    target: Target;
}

export default function generate(statements: Statement[], target: Target): Assembly {
    const state: State = {
        stackOffset: 0,
        outputBuffer: new OutputBuffer(),
        target
    }

    generateStatements(statements, [], state);

    return { code: state.outputBuffer.evaluate() }
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
                    state.outputBuffer.write('(\n');
                    generateExpression(statement.assignment, [...variables, ...inheritedVariables], state);
                    state.outputBuffer.write(`) > STACK[${state.stackOffset}]\n`);
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

                state.outputBuffer.write('(\n');
                generateExpression(statement.assignment, [...variables, ...inheritedVariables], state);
                state.outputBuffer.write(`) > STACK[${variable.offset}]\n`);
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

                state.outputBuffer.write(`STACK[${variable.offset}]${statement.type === 'increment' ? '++' : '--'}\n`);
            } break;
            case 'function-call': {
                throw new Error('Not implemented');
            } break;
            case 'scope': {
                state.outputBuffer.write('{\n');
                generateStatements(statement.statements, [...variables, ...inheritedVariables], state);
                state.outputBuffer.write('}\n');
            } break;
            case 'if': {
                const ifEnterMarkers: OutputBufferMarker[] = state.outputBuffer.createMarkers(statement.blocks.length);
                const ifExitMarker = state.outputBuffer.createMarker();
                const elseEnterMarker = state.outputBuffer.createMarker();

                statement.blocks.forEach((block, i) => {
                    state.outputBuffer.write('(\n');
                    generateExpression(block.condition, [...variables, ...inheritedVariables], state);
                    ifEnterMarkers[i].use(21, (marker) => `) JMP IF TRUE ${marker.toString().padStart(6, '.')}\n`);
                });

                elseEnterMarker.use(11, (marker) => `JMP ${marker.toString().padStart(6, '.')}\n`);

                statement.blocks.map((block) => block.statements).forEach((block, i) => {
                    ifEnterMarkers[i].set();
                    state.outputBuffer.write('{\n');
                    generateStatements(block, [...variables, ...inheritedVariables], state);
                    state.outputBuffer.write('}\n');
                    ifExitMarker.use(11, (marker) => `JMP ${marker.toString().padStart(6, '.')}\n`);
                });

                elseEnterMarker.set();

                if (statement.elseBlock !== null) {
                    state.outputBuffer.write('{\n');
                    generateStatements(statement.elseBlock, [...variables, ...inheritedVariables], state);
                    state.outputBuffer.write('}\n');
                }

                ifExitMarker.set();
            } break;
            case 'while': {
                const loopEnterMarker = state.outputBuffer.createMarker();
                const loopExitMarker = state.outputBuffer.createMarker();

                loopEnterMarker.set();

                if (!statement.doWhile) {
                    state.outputBuffer.write('(\n');
                    generateExpression(statement.condition, [...variables, ...inheritedVariables], state);
                    loopExitMarker.use(22, (marker) => `) JMP IF FALSE ${marker.toString().padStart(6, '.')}\n`);
                }

                state.outputBuffer.write('{\n');
                generateStatements(statement.statements, [...variables, ...inheritedVariables], state);
                state.outputBuffer.write('}\n');

                if (!statement.doWhile) {
                    loopEnterMarker.use(11, (marker) => `JMP ${marker.toString().padStart(6, '.')}\n`);
                    loopExitMarker.set();
                } else {
                    state.outputBuffer.write('(\n');
                    generateExpression(statement.condition, [...variables, ...inheritedVariables], state);
                    loopEnterMarker.use(21, (marker) => `) JMP IF TRUE ${marker.toString().padStart(6, '.')}\n`);
                }
            } break;
            case 'for': {
                const actionMarker = state.outputBuffer.createMarker();
                const conditionMarker = state.outputBuffer.createMarker();
                const loopExitMarker = state.outputBuffer.createMarker();

                const initializationVariables = [];

                if (statement.initialization !== null) {
                    state.outputBuffer.write('{\n');
                    initializationVariables.push(...generateStatements([statement.initialization], [...variables, ...inheritedVariables], state));
                    state.outputBuffer.write('}\n');
                }

                conditionMarker.use(11, (marker) => `JMP ${marker.toString().padStart(6, '.')}\n`);

                actionMarker.set();

                if (statement.action !== null) {
                    state.outputBuffer.write('{\n');
                    generateStatements([statement.action], [...initializationVariables, ...variables, ...inheritedVariables], state);
                    state.outputBuffer.write('}\n');
                }

                conditionMarker.set();

                if (statement.condition !== null) {
                    state.outputBuffer.write('(\n');
                    generateExpression(statement.condition, [...initializationVariables, ...variables, ...inheritedVariables], state);
                    loopExitMarker.use(22, (marker) => `) JMP IF FALSE ${marker.toString().padStart(6, '.')}\n`);
                }

                state.outputBuffer.write('{\n');
                generateStatements(statement.statements, [...initializationVariables, ...variables, ...inheritedVariables], state);
                state.outputBuffer.write('}\n');

                actionMarker.use(11, (marker) => `JMP ${marker.toString().padStart(6, '.')}\n`);
                if (statement.condition !== null) {
                    loopExitMarker.set();
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
            state.outputBuffer.write(`LITERAL INT: ${expression.value}\n`);
        } break;
        case 'float-literal': {
            state.outputBuffer.write(`LITERAL FLOAT: ${expression.value}\n`);
        } break;
        case 'string-literal': {
            state.outputBuffer.write(`LITERAL STRING: ${expression.value}\n`);
        } break;
        case 'variable': {
            const variable = inheritedVariables.find((variable) => variable.variableIdentifier === expression.identifier) ?? null;

            if (variable === null) {
                throw new InputError(['Variable ', { value: expression.identifier, bold: true }, ' is not declared'], expression.location);
            }

            state.outputBuffer.write(`STACK[${variable.offset}]\n`);
        } break;
        case 'increment':
        case 'decrement': {
            const variable = inheritedVariables.find((variable) => variable.variableIdentifier === expression.identifier) ??
                null;

            if (variable === null) {
                throw new InputError(['Variable ', { value: expression.identifier, bold: true }, ' is not declared'], expression.location);
            }

            state.outputBuffer.write(`STACK[${variable.offset}]${expression.type === 'increment' ? '++' : '--'}\n`);
        } break;
        case 'sub-expression': {
            state.outputBuffer.write('(\n');
            generateExpression(expression.expression, inheritedVariables, state);
            state.outputBuffer.write(')\n');
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
            state.outputBuffer.write('(\n');
            generateExpression(expression.left, inheritedVariables, state);
            state.outputBuffer.write(`) ${expression.type} (\n`);
            generateExpression(expression.right, inheritedVariables, state);
            state.outputBuffer.write(')\n');
        } break;
        default: {
            exhaust(type);
        } break;
    }
}

type OutputBufferMarker = {
    set: () => void;
    use: (size: number, transformer: (marker: number) => (Uint8Array | number[] | string)) => void;
}

class OutputBuffer {
    private readonly chunks: (Buffer | { type: 'marker', id: string }
        | { type: 'marker-usage', id: string, size: number, transformer: (marker: number) => (Uint8Array | number[] | string) })[];

    constructor() {
        this.chunks = [];
    }

    write(...data: (Uint8Array | number[] | string)[]): void {
        this.chunks.push(...data.map((chunk) => Buffer.from(chunk)));
    }

    createMarker(): OutputBufferMarker {
        const id = Math.random().toString(16).slice(2);
        let used = false;
        return {
            set: () => {
                if (used) {
                    log('ERROR', 'Internal error: Output buffer marker set more than once');
                }

                this.chunks.push({ type: 'marker', id });
                used = true;
            },
            use: (size, transformer) => {
                this.chunks.push({ type: 'marker-usage', id, size, transformer });
            }
        }
    }

    createMarkers(count: number): OutputBufferMarker[] {
        return new Array(count).fill(null).map(() => this.createMarker());
    }

    evaluate(): Buffer {
        const markerMappings: Map<string, number> = new Map();

        let outputLength = 0;
        this.chunks.forEach((chunk, i) => {
            if (chunk instanceof Buffer) {
                outputLength += chunk.byteLength;
                return;
            }

            const type = chunk.type;
            switch (type) {
                case 'marker': {
                    markerMappings.set(chunk.id, outputLength);
                    this.chunks[i] = Buffer.alloc(0);
                    outputLength += 0;
                } break;
                case 'marker-usage': {
                    outputLength += chunk.size;
                } break;
                default: {
                    exhaust(type);
                } break;
            }
        });
        this.chunks.forEach((chunk, i) => {
            if (!(chunk instanceof Buffer) && chunk.type === 'marker-usage') {
                if (!markerMappings.has(chunk.id)) {
                    log('ERROR', 'Internal error: Output buffer marker not set');
                    this.chunks[i] = Buffer.alloc(0);
                    return;
                }

                const buffer = Buffer.from(chunk.transformer(markerMappings.get(chunk.id)!));
                if (buffer.byteLength !== chunk.size) {
                    log('ERROR', 'Internal error: Output buffer marker usage length is invalid');
                    this.chunks[i] = Buffer.alloc(0);
                    return;
                }
                this.chunks[i] = buffer;
            }
        });

        return Buffer.concat(this.chunks as Buffer[]);
    }
}
