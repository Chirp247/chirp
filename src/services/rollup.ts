// Daily rollup aggregation
import { query } from '../db';
import { config } from '../config';

let lastRollupDate: string | null = null;

// Validate date format to prevent SQL injection when inlining dates
function isValidDate(s: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export async function runRollup(targetDate?: string) {
    const day = targetDate || getYesterday();

    if (!isValidDate(day)) {
        console.error('Invalid date format: ' + day);
        return;
    }

    console.log(`Running rollup for ${day}...`);

    // Perry's mysql2 cannot bind params in INSERT...SELECT queries,
    // so we inline the validated date string directly.
    await query(
        "INSERT INTO rollups (projectId, event, dimKey, dimVal, day, count, uniqueClients) " +
        "SELECT projectId, event, NULL, NULL, '" + day + "', COUNT(*), COUNT(DISTINCT clientId) " +
        "FROM events " +
        "WHERE DATE(timestamp) = '" + day + "' " +
        "GROUP BY projectId, event " +
        "ON DUPLICATE KEY UPDATE count = VALUES(count), uniqueClients = VALUES(uniqueClients)"
    );

    // Per-dimension rollups (dim1..dim4)
    // Unrolled loop since Perry compiles statically
    await query(
        "INSERT INTO rollups (projectId, event, dimKey, dimVal, day, count, uniqueClients) " +
        "SELECT projectId, event, dim1Key, dim1Val, '" + day + "', COUNT(*), COUNT(DISTINCT clientId) " +
        "FROM events " +
        "WHERE DATE(timestamp) = '" + day + "' AND dim1Key IS NOT NULL " +
        "GROUP BY projectId, event, dim1Key, dim1Val " +
        "ON DUPLICATE KEY UPDATE count = VALUES(count), uniqueClients = VALUES(uniqueClients)"
    );

    await query(
        "INSERT INTO rollups (projectId, event, dimKey, dimVal, day, count, uniqueClients) " +
        "SELECT projectId, event, dim2Key, dim2Val, '" + day + "', COUNT(*), COUNT(DISTINCT clientId) " +
        "FROM events " +
        "WHERE DATE(timestamp) = '" + day + "' AND dim2Key IS NOT NULL " +
        "GROUP BY projectId, event, dim2Key, dim2Val " +
        "ON DUPLICATE KEY UPDATE count = VALUES(count), uniqueClients = VALUES(uniqueClients)"
    );

    await query(
        "INSERT INTO rollups (projectId, event, dimKey, dimVal, day, count, uniqueClients) " +
        "SELECT projectId, event, dim3Key, dim3Val, '" + day + "', COUNT(*), COUNT(DISTINCT clientId) " +
        "FROM events " +
        "WHERE DATE(timestamp) = '" + day + "' AND dim3Key IS NOT NULL " +
        "GROUP BY projectId, event, dim3Key, dim3Val " +
        "ON DUPLICATE KEY UPDATE count = VALUES(count), uniqueClients = VALUES(uniqueClients)"
    );

    await query(
        "INSERT INTO rollups (projectId, event, dimKey, dimVal, day, count, uniqueClients) " +
        "SELECT projectId, event, dim4Key, dim4Val, '" + day + "', COUNT(*), COUNT(DISTINCT clientId) " +
        "FROM events " +
        "WHERE DATE(timestamp) = '" + day + "' AND dim4Key IS NOT NULL " +
        "GROUP BY projectId, event, dim4Key, dim4Val " +
        "ON DUPLICATE KEY UPDATE count = VALUES(count), uniqueClients = VALUES(uniqueClients)"
    );

    console.log(`Rollup complete for ${day}`);
    lastRollupDate = day;
}

export async function pruneOldEvents() {
    if (config.retentionDays <= 0) return;

    const days = config.retentionDays;
    const result = await query(
        'DELETE FROM events WHERE timestamp < DATE_SUB(NOW(), INTERVAL ' + days + ' DAY)'
    );

    // Try to extract affectedRows
    let affectedRows = 0;
    if (Array.isArray(result) && result[0]) {
        const header = result[0] as any;
        if (header.affectedRows) {
            affectedRows = header.affectedRows;
        }
    }
    if (affectedRows > 0) {
        console.log(`Pruned ${affectedRows} old events`);
    }
}

function getYesterday(): string {
    // Perry's Date.setDate() is a no-op, so use timestamp arithmetic
    var ms = Date.now() - 24 * 60 * 60 * 1000;
    return new Date(ms).toISOString().split('T')[0];
}

export function startRollupScheduler() {
    // Run on startup for any missed days
    runRollup().catch(err => console.error('Startup rollup failed:', err));

    // Check hourly if it's past 03:00 UTC and today's rollup hasn't run
    // Uses recursive setTimeout instead of setInterval (Perry compatibility)
    function scheduleNextCheck() {
        setTimeout(async () => {
            const now = new Date();
            const hour = now.getUTCHours();

            if (hour >= 3 && lastRollupDate !== getYesterday()) {
                try {
                    await runRollup();
                    await pruneOldEvents();
                } catch (err) {
                    console.error('Scheduled rollup failed:', err);
                }
            }
            scheduleNextCheck();
        }, 60 * 60 * 1000);
    }
    scheduleNextCheck();
}
