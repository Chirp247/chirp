// Query endpoint: GET /api/v1/query
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db';

function extractRows(result: any): any[] {
    if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
        return result[0];
    }
    if (Array.isArray(result)) {
        return result;
    }
    return [];
}

function isValidDate(s: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Escape single quotes for safe SQL string inlining
function esc(s: string): string {
    return s.replace(/'/g, "''").replace(/\\/g, "\\\\");
}

function calcFromDate(period: string): string {
    if (period === 'all') {
        return '2020-01-01';
    }
    // Perry's Date.setDate() is a no-op, so use timestamp arithmetic
    var days = 30;
    if (period === '7d') days = 7;
    else if (period === '90d') days = 90;
    else if (period === '12m') days = 365;
    var ms = Date.now() - days * 24 * 60 * 60 * 1000;
    return new Date(ms).toISOString().split('T')[0];
}

export async function queryRoutes(app: FastifyInstance) {
    app.get('/query', async (request: FastifyRequest, reply: FastifyReply) => {
        const q = request.query as Record<string, string>;

        const projectName = q.project || '';
        if (projectName.length === 0) {
            reply.status(400);
            return { error: 'project parameter is required' };
        }

        // Project lookup uses single param which works in Perry
        const projectResult = await query(
            'SELECT id, apiKey FROM projects WHERE name = ?',
            [projectName]
        );
        const projects = extractRows(projectResult) as Array<{ id: string; apiKey: string }>;

        if (!projects || projects.length === 0) {
            reply.status(404);
            return { error: 'Project not found' };
        }

        const project = projects[0];
        const projectId = project.id;

        const period = q.period || '30d';
        const fromDate = q.from || calcFromDate(period);
        const toDate = q.to || new Date().toISOString().split('T')[0];
        const eventName = q.event || '';
        const groupBy = q.group_by || '';

        if (!isValidDate(fromDate) || !isValidDate(toDate)) {
            reply.status(400);
            return { error: 'Invalid date format' };
        }

        // Perry's mysql2 cannot reliably bind multiple params in complex queries.
        // All values are inlined with escaping; dates are validated above.
        if (groupBy.length > 0) {
            if (eventName.length > 0) {
                return await queryGroupByWithEvent(projectId, groupBy, eventName, fromDate, toDate);
            } else {
                return await queryGroupByNoEvent(projectId, groupBy, fromDate, toDate);
            }
        } else {
            if (eventName.length > 0) {
                return await querySeriesWithEvent(projectId, eventName, fromDate, toDate);
            } else {
                return await querySeriesNoEvent(projectId, fromDate, toDate);
            }
        }
    });
}

async function querySeriesWithEvent(projectId: string, eventName: string, fromDate: string, toDate: string) {
    const result = await query(
        "SELECT CAST(day AS CHAR) as d, CAST(SUM(count) AS SIGNED) as cnt, CAST(SUM(uniqueClients) AS SIGNED) as uniq " +
        "FROM rollups WHERE projectId = '" + esc(projectId) + "' AND event = '" + esc(eventName) + "' " +
        "AND dimKey IS NULL AND day >= '" + fromDate + "' AND day <= '" + toDate + "' " +
        "GROUP BY day ORDER BY day ASC"
    );
    const rows = extractRows(result);
    return buildSeriesResponse(rows);
}

async function querySeriesNoEvent(projectId: string, fromDate: string, toDate: string) {
    const result = await query(
        "SELECT CAST(day AS CHAR) as d, CAST(SUM(count) AS SIGNED) as cnt, CAST(SUM(uniqueClients) AS SIGNED) as uniq " +
        "FROM rollups WHERE projectId = '" + esc(projectId) + "' " +
        "AND dimKey IS NULL AND day >= '" + fromDate + "' AND day <= '" + toDate + "' " +
        "GROUP BY day ORDER BY day ASC"
    );
    const rows = extractRows(result);
    return buildSeriesResponse(rows);
}

function buildSeriesResponse(rows: any[]) {
    let total = 0;
    let uniqueClients = 0;
    const series: any[] = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as any;
        const c = Number(row.cnt) || 0;
        const u = Number(row.uniq) || 0;
        total += c;
        uniqueClients += u;
        series.push({ date: row.d || '', count: c, unique: u });
    }
    return { total: total, uniqueClients: uniqueClients, series: series };
}

async function queryGroupByWithEvent(projectId: string, groupBy: string, eventName: string, fromDate: string, toDate: string) {
    const result = await query(
        "SELECT dimVal, CAST(SUM(count) AS SIGNED) as cnt, CAST(SUM(uniqueClients) AS SIGNED) as uniq " +
        "FROM rollups WHERE projectId = '" + esc(projectId) + "' AND dimKey = '" + esc(groupBy) + "' " +
        "AND event = '" + esc(eventName) + "' AND day >= '" + fromDate + "' AND day <= '" + toDate + "' " +
        "GROUP BY dimVal ORDER BY cnt DESC"
    );
    const rows = extractRows(result);
    return buildBreakdownResponse(rows, groupBy);
}

async function queryGroupByNoEvent(projectId: string, groupBy: string, fromDate: string, toDate: string) {
    const result = await query(
        "SELECT dimVal, CAST(SUM(count) AS SIGNED) as cnt, CAST(SUM(uniqueClients) AS SIGNED) as uniq " +
        "FROM rollups WHERE projectId = '" + esc(projectId) + "' AND dimKey = '" + esc(groupBy) + "' " +
        "AND day >= '" + fromDate + "' AND day <= '" + toDate + "' " +
        "GROUP BY dimVal ORDER BY cnt DESC"
    );
    const rows = extractRows(result);
    return buildBreakdownResponse(rows, groupBy);
}

function buildBreakdownResponse(rows: any[], groupBy: string) {
    let total = 0;
    const breakdown: any[] = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as any;
        const c = Number(row.cnt) || 0;
        total += c;
        breakdown.push({ dimension: groupBy, value: row.dimVal || '', count: c, unique: Number(row.uniq) || 0 });
    }
    return { total: total, uniqueClients: 0, breakdown: breakdown };
}
