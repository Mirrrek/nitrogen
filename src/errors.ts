import { Location } from '@/log';

export type ErrorMessage = string | (string | { value: string, bold: boolean })[];

export class InputError extends Error {
    data: { message: ErrorMessage, location: Location };

    constructor(message: ErrorMessage, location: Location) {
        super(Array.isArray(message) ? message.map((chunk) => typeof chunk === 'string' ? chunk : chunk.value).join('') : message);
        this.name = 'InputError';
        this.data = { message, location };
    }
}
