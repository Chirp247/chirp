// Daily rollup aggregation
import { query } from '../db';
import { config } from '../config';

let lastRollupDate: string | null = null;

export async function runRollup(targetDate?: string) {
    const day = targetDate || getYesterday();

    console.log(`Running rollup for ${day}...`);

    // Total row (dimKey=NULL): aggregate event counts per project+event for the day
    await query(`
        INSERT INTO rollups (projectId, event, dimKey, dimVal, day, count, uniqueClients)
        SELECT projectId, event, NULL, NULL, ?, COUNT(*), COUNT(DISTINCT clientId)
        FROM events
        WHERE DATE(timestamp) = ?
        GROUP BY projectId, event
        ON DUPLICATE KEY UPDATE
            count = VALUES(count),
            uniqueClients = VALUES(uniqueClients)
    `, [day, day]);

    // Per-dimension rollups (dim1..dim4)
    // Unrolled loop since Perry template literals in SQL are compiled statically
    await query(`
        INSERT INTO rollups (projectId, event, dimKey, dimVal, day, count, uniqueClients)
        SELECT projectId, event, dim1Key, dim1Val, ?, COUNT(*), COUNT(DISTINCT clientId)
        FROM events
        WHERE DATE(timestamp) = ? AND dim1Key IS NOT NULL
        GROUP BY projectId, event, dim1Key, dim1Val
        ON DUPLICATE KEY UPDATE count = VALUES(count), uniqueClients = VALUES(uniqueClients)
    `, [day, day]);

    await query(`
        INSERT INTO rollups (projectId, event, dimKey, dimVal, day, count, uniqueClients)
        SELECT projectId, event, dim2Key, dim2Val, ?, COUNT(*), COUNT(DISTINCT clientId)
        FROM events
        WHERE DATE(timestamp) = ? AND dim2Key IS NOT NULL
        GROUP BY projectId, event, dim2Key, dim2Val
        ON DUPLICATE KEY UPDATE count = VALUES(count), uniqueClients = VALUES(uniqueClients)
    `, [day, day]);

    await query(`
        INSERT INTO rollups (projectId, event, dimKey, dimVal, day, count, uniqueClients)
        SELECT projectId, event, dim3Key, dim3Val, ?, COUNT(*), COUNT(DISTINCT clientId)
        FROM events
        WHERE DATE(timestamp) = ? AND dim3Key IS NOT NULL
        GROUP BY projectId, event, dim3Key, dim3Val
        ON DUPLICATE KEY UPDATE count = VALUES(count), uniqueClients = VALUES(uniqueClients)
    `, [day, day]);

    await query(`
        INSERT INTO rollups (projectId, event, dimKey, dimVal, day, count, uniqueClients)
        SELECT projectId, event, dim4Key, dim4Val, ?, COUNT(*), COUNT(DISTINCT clientId)
        FROM events
        WHERE DATE(timestamp) = ? AND dim4Key IS NOT NULL
        GROUP BY projectId, event, dim4Key, dim4Val
        ON DUPLICATE KEY UPDATE count = VALUES(count), uniqueClients = VALUES(uniqueClients)
    `, [day, day]);

    console.log(`Rollup complete for ${day}`);
    lastRollupDate = day;
}

export async function pruneOldEvents() {
    if (config.retentionDays <= 0) return;

    const result = await query(
        'DELETE FROM events WHERE timestamp < DATE_SUB(NOW(), INTERVAL ? DAY)',
        [config.retentionDays]
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
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
}

export function startRollupScheduler() {
    // Run on startup for any missed days
    runRollup().catch(err => console.error('Startup rollup failed:', err));

    // Check hourly if it's past 03:00 UTC and today's rollup hasn't run
    setInterval(async () => {
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
    }, 60 * 60 * 1000);
}
