// Event payload validation
import { EventPayload } from '../types';

const EVENT_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const MAX_EVENT_LENGTH = 100;
const MAX_DIM_KEY_LENGTH = 50;
const MAX_DIM_VAL_LENGTH = 200;
const MAX_DIMS = 4;

export function validateEvent(payload: unknown): { valid: boolean; error?: string; parsed?: EventPayload } {
    if (typeof payload !== 'object' || payload === null) {
        return { valid: false, error: 'Payload must be a JSON object' };
    }

    const p = payload as Record<string, unknown>;

    if (typeof p.event !== 'string') {
        return { valid: false, error: 'event must be a string' };
    }

    if (p.event.length === 0 || p.event.length > MAX_EVENT_LENGTH) {
        return { valid: false, error: `event must be 1-${MAX_EVENT_LENGTH} characters` };
    }

    if (!EVENT_NAME_REGEX.test(p.event)) {
        return { valid: false, error: 'event must match ^[a-zA-Z0-9_-]+$' };
    }

    const dims: Record<string, string> = {};
    if (p.dims !== undefined) {
        if (typeof p.dims !== 'object' || p.dims === null || Array.isArray(p.dims)) {
            return { valid: false, error: 'dims must be a plain object' };
        }

        const dimEntries = Object.entries(p.dims as Record<string, unknown>);
        if (dimEntries.length > MAX_DIMS) {
            return { valid: false, error: `dims must have at most ${MAX_DIMS} entries` };
        }

        for (const [key, val] of dimEntries) {
            if (typeof val !== 'string') {
                return { valid: false, error: `dim value for "${key}" must be a string` };
            }
            if (key.length === 0 || key.length > MAX_DIM_KEY_LENGTH) {
                return { valid: false, error: `dim key "${key}" must be 1-${MAX_DIM_KEY_LENGTH} characters` };
            }
            if (val.length > MAX_DIM_VAL_LENGTH) {
                return { valid: false, error: `dim value for "${key}" must be at most ${MAX_DIM_VAL_LENGTH} characters` };
            }
            dims[key] = val;
        }
    }

    return {
        valid: true,
        parsed: {
            event: p.event,
            dims: Object.keys(dims).length > 0 ? dims : undefined,
            clientId: typeof p.clientId === 'string' ? p.clientId : undefined,
        },
    };
}

// Returns flat array: [dim1Key, dim1Val, dim2Key, dim2Val, dim3Key, dim3Val, dim4Key, dim4Val]
export function normalizeDimsToArray(dims?: Record<string, string>): Array<string | null> {
    const result: Array<string | null> = [null, null, null, null, null, null, null, null];

    if (!dims) return result;

    const keys = Object.keys(dims);
    for (let i = 0; i < keys.length && i < 4; i++) {
        const key = keys[i];
        result[i * 2] = key;
        result[i * 2 + 1] = dims[key];
    }

    return result;
}
