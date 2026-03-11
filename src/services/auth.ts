// API key lookup + HMAC verification
import crypto from 'crypto';
import { query } from '../db';

export interface AuthResult {
    projectId: string;
    clientId: string | null;
}

export async function lookupAndVerify(
    apiKey: string,
    signature: string | null,
    clientId: string | null,
    rawBody: string
): Promise<AuthResult | null> {
    if (!apiKey || apiKey.length === 0) {
        return null;
    }

    const result = await query(
        'SELECT id, hmacSecret FROM projects WHERE apiKey = ?',
        [apiKey]
    );

    // Perry returns [rows, fields]
    let rows: Array<{ id: string; hmacSecret: string }>;
    if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
        rows = result[0] as Array<{ id: string; hmacSecret: string }>;
    } else if (Array.isArray(result)) {
        rows = result as any;
    } else {
        return null;
    }

    if (!rows || rows.length === 0) {
        return null;
    }

    const project = rows[0];

    // Verify HMAC signature if provided
    if (signature && signature.length > 0) {
        const expected = crypto.createHmac('sha256', project.hmacSecret)
            .update(rawBody)
            .digest('hex');
        if (signature !== expected) {
            return null;
        }
    }

    return {
        projectId: project.id,
        clientId: clientId || null,
    };
}
