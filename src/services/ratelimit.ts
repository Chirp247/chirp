// In-memory rate limiting
import { config } from '../config';

interface Counter {
    count: number;
    windowStart: number;
}

const ipCounts: Map<string, Counter> = new Map();
const projectCounts: Map<string, Counter> = new Map();
const clientCounts: Map<string, Counter> = new Map();

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function checkWindow(map: Map<string, Counter>, key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = map.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
        map.set(key, { count: 1, windowStart: now });
        return true;
    }

    entry.count++;
    if (entry.count > limit) {
        return false;
    }

    return true;
}

export function checkRateLimit(ip: string, projectId: string, clientId: string | null): boolean {
    if (!checkWindow(ipCounts, ip, config.rateLimit.ipPerHour, HOUR_MS)) {
        return false;
    }

    if (!checkWindow(projectCounts, projectId, config.rateLimit.projectPerDay, DAY_MS)) {
        return false;
    }

    if (clientId && !checkWindow(clientCounts, clientId, config.rateLimit.clientPerHour, HOUR_MS)) {
        return false;
    }

    return true;
}

function cleanupStaleEntries() {
    const now = Date.now();

    for (const [key, entry] of ipCounts) {
        if (now - entry.windowStart >= HOUR_MS) {
            ipCounts.delete(key);
        }
    }

    for (const [key, entry] of projectCounts) {
        if (now - entry.windowStart >= DAY_MS) {
            projectCounts.delete(key);
        }
    }

    for (const [key, entry] of clientCounts) {
        if (now - entry.windowStart >= HOUR_MS) {
            clientCounts.delete(key);
        }
    }
}

// Cleanup stale entries every 10 minutes
setInterval(cleanupStaleEntries, 10 * 60 * 1000);
