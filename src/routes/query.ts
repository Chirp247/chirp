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

function calcFromDate(period: string): string {
    const now = new Date();
    if (period === '7d') {
        now.setDate(now.getDate() - 7);
    } else if (period === '90d') {
        now.setDate(now.getDate() - 90);
    } else if (period === '12m') {
        now.setMonth(now.getMonth() - 12);
    } else if (period === 'all') {
        return '2020-01-01';
    } else {
        now.setDate(now.getDate() - 30);
    }
    return now.toISOString().split('T')[0];
}

export async function queryRoutes(app: FastifyInstance) {
    app.get('/query', async (request: FastifyRequest, reply: FastifyReply) => {
        const q = request.query as Record<string, string>;

        const projectName = q.project || '';
        if (projectName.length === 0) {
            reply.status(400);
            return { error: 'project parameter is required' };
        }

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
        'SELECT CAST(day AS CHAR) as d, CAST(SUM(count) AS SIGNED) as cnt, CAST(SUM(uniqueClients) AS SIGNED) as uniq FROM rollups WHERE projectId = ? AND event = ? AND dimKey IS NULL AND day >= ? AND day <= ? GROUP BY day ORDER BY day ASC',
        [projectId, eventName, fromDate, toDate]
    );
    const rows = extractRows(result);
    return buildSeriesResponse(rows);
}

async function querySeriesNoEvent(projectId: string, fromDate: string, toDate: string) {
    const result = await query(
        'SELECT CAST(day AS CHAR) as d, CAST(SUM(count) AS SIGNED) as cnt, CAST(SUM(uniqueClients) AS SIGNED) as uniq FROM rollups WHERE projectId = ? AND dimKey IS NULL AND day >= ? AND day <= ? GROUP BY day ORDER BY day ASC',
        [projectId, fromDate, toDate]
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
        'SELECT dimVal, CAST(SUM(count) AS SIGNED) as cnt, CAST(SUM(uniqueClients) AS SIGNED) as uniq FROM rollups WHERE projectId = ? AND dimKey = ? AND event = ? AND day >= ? AND day <= ? GROUP BY dimVal ORDER BY cnt DESC',
        [projectId, groupBy, eventName, fromDate, toDate]
    );
    const rows = extractRows(result);
    return buildBreakdownResponse(rows, groupBy);
}

async function queryGroupByNoEvent(projectId: string, groupBy: string, fromDate: string, toDate: string) {
    const result = await query(
        'SELECT dimVal, CAST(SUM(count) AS SIGNED) as cnt, CAST(SUM(uniqueClients) AS SIGNED) as uniq FROM rollups WHERE projectId = ? AND dimKey = ? AND day >= ? AND day <= ? GROUP BY dimVal ORDER BY cnt DESC',
        [projectId, groupBy, fromDate, toDate]
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
