// Ingest routes: POST /api/v1/event, POST /api/v1/events
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db';
import { lookupAndVerify } from '../services/auth';
import { checkRateLimit } from '../services/ratelimit';

const EVENT_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

function validateAndInsert(body: Record<string, unknown>): {
    valid: boolean;
    error?: string;
    event?: string;
    d1k: string; d1v: string;
    d2k: string; d2v: string;
    d3k: string; d3v: string;
    d4k: string; d4v: string;
} {
    const result = { valid: false, error: '', event: '',
        d1k: '', d1v: '', d2k: '', d2v: '',
        d3k: '', d3v: '', d4k: '', d4v: '' };

    if (!body || typeof body.event !== 'string') {
        result.error = 'event must be a string';
        return result;
    }

    if (body.event.length === 0 || body.event.length > 100) {
        result.error = 'event must be 1-100 characters';
        return result;
    }

    if (!EVENT_NAME_REGEX.test(body.event)) {
        result.error = 'event must match ^[a-zA-Z0-9_-]+$';
        return result;
    }

    result.event = body.event;
    result.valid = true;

    // Extract dims directly — avoid Object.keys/Object.entries
    if (body.dims && typeof body.dims === 'object') {
        const d = body.dims as Record<string, unknown>;
        // Check known common dimension names directly
        // Perry-safe: no Object.keys(), just direct property access
        const dimNames = ['platform', 'target', 'os', 'arch', 'version', 'channel',
            'source', 'type', 'action', 'status', 'env', 'region', 'lang', 'tier', 'plan', 'variant'];
        let dimIdx = 0;
        for (const name of dimNames) {
            if (dimIdx >= 4) break;
            const val = d[name];
            if (typeof val === 'string') {
                if (dimIdx === 0) { result.d1k = name; result.d1v = val; }
                else if (dimIdx === 1) { result.d2k = name; result.d2v = val; }
                else if (dimIdx === 2) { result.d3k = name; result.d3v = val; }
                else if (dimIdx === 3) { result.d4k = name; result.d4v = val; }
                dimIdx++;
            }
        }
    }

    return result;
}

export async function ingestRoutes(app: FastifyInstance) {
    // Single event ingestion
    app.post('/event', async (request: FastifyRequest, reply: FastifyReply) => {
        const rawBody = JSON.stringify(request.body);
        const headers = request.headers;
        const apiKey = headers['x-chirp-key'] as string || '';
        const signature = headers['x-chirp-signature'] as string || null;
        const clientHeader = headers['x-chirp-client'] as string || null;

        const auth = await lookupAndVerify(apiKey, signature, clientHeader, rawBody);
        if (!auth) {
            reply.status(401);
            return { error: 'Unauthorized' };
        }

        const forwarded = headers['x-forwarded-for'] as string || '';
        const ip = forwarded ? forwarded.split(',')[0].trim() : '0.0.0.0';
        const clientId = auth.clientId || '';

        if (!checkRateLimit(ip, auth.projectId, clientId)) {
            reply.status(202);
            return { accepted: true };
        }

        const v = validateAndInsert(request.body as Record<string, unknown>);
        if (!v.valid) {
            reply.status(400);
            return { error: v.error };
        }

        await query(
            `INSERT INTO events (projectId, event, dim1Key, dim1Val, dim2Key, dim2Val, dim3Key, dim3Val, dim4Key, dim4Val, clientId)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                auth.projectId, v.event,
                v.d1k, v.d1v, v.d2k, v.d2v,
                v.d3k, v.d3v, v.d4k, v.d4v,
                clientId,
            ]
        );

        reply.status(202);
        return { accepted: true };
    });

    // Batch event ingestion (max 50)
    app.post('/events', async (request: FastifyRequest, reply: FastifyReply) => {
        const rawBody = JSON.stringify(request.body);
        const headers = request.headers;
        const apiKey = headers['x-chirp-key'] as string || '';
        const signature = headers['x-chirp-signature'] as string || null;
        const clientHeader = headers['x-chirp-client'] as string || null;

        const auth = await lookupAndVerify(apiKey, signature, clientHeader, rawBody);
        if (!auth) {
            reply.status(401);
            return { error: 'Unauthorized' };
        }

        const body = request.body as Record<string, unknown>;
        if (!body || !Array.isArray(body.events)) {
            reply.status(400);
            return { error: 'events must be an array' };
        }

        if (body.events.length > 50) {
            reply.status(400);
            return { error: 'Batch size must not exceed 50' };
        }

        const forwarded = headers['x-forwarded-for'] as string || '';
        const ip = forwarded ? forwarded.split(',')[0].trim() : '0.0.0.0';
        const clientId = auth.clientId || '';

        if (!checkRateLimit(ip, auth.projectId, clientId)) {
            reply.status(202);
            return { accepted: true, count: 0 };
        }

        let inserted = 0;
        for (const rawEvent of body.events) {
            const v = validateAndInsert(rawEvent as Record<string, unknown>);
            if (!v.valid) continue;

            await query(
                `INSERT INTO events (projectId, event, dim1Key, dim1Val, dim2Key, dim2Val, dim3Key, dim3Val, dim4Key, dim4Val, clientId)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    auth.projectId, v.event,
                    v.d1k, v.d1v, v.d2k, v.d2v,
                    v.d3k, v.d3v, v.d4k, v.d4v,
                    clientId,
                ]
            );
            inserted++;
        }

        reply.status(202);
        return { accepted: true, count: inserted };
    });
}
