// Badge endpoint: GET /badge/:project/:event
import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { renderBadge } from '../services/badge-render';

function extractRows(result: any): any[] {
    if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
        return result[0];
    }
    if (Array.isArray(result)) {
        return result;
    }
    return [];
}

export async function badgeRoutes(app: FastifyInstance) {
    app.get<{ Params: { project: string; event: string } }>(
        '/:project/:event',
        async (request, reply) => {
            const { project, event } = request.params;
            const period = (request.query as Record<string, string>).period || '30d';

            const projectResult = await query(
                'SELECT id FROM projects WHERE name = ? AND public = TRUE',
                [project]
            );
            const projects = extractRows(projectResult) as Array<{ id: string }>;

            if (!projects || projects.length === 0) {
                const svg = renderBadge(event, 0, period);
                reply.header('Content-Type', 'image/svg+xml');
                reply.header('Cache-Control', 'public, max-age=300');
                return svg;
            }

            const projectId = projects[0].id;

            // Perry's Date.setDate()/setMonth() are no-ops, so use timestamp
            // arithmetic (mirrors calcFromDate in routes/query.ts).
            let fromDate: string;
            if (period === 'all') {
                fromDate = '2020-01-01';
            } else {
                var days = 30;
                if (period === '7d') days = 7;
                else if (period === '90d') days = 90;
                else if (period === '12m') days = 365;
                var ms = Date.now() - days * 24 * 60 * 60 * 1000;
                fromDate = new Date(ms).toISOString().split('T')[0];
            }

            const countResult = await query(
                'SELECT CAST(COALESCE(SUM(count), 0) AS SIGNED) as total FROM rollups WHERE projectId = ? AND event = ? AND dimKey IS NULL AND day >= ?',
                [projectId, event, fromDate]
            );
            const rows = extractRows(countResult) as Array<{ total: number }>;
            const total = rows.length > 0 ? Number(rows[0].total) : 0;

            const svg = renderBadge(event, total, period);
            reply.header('Content-Type', 'image/svg+xml');
            reply.header('Cache-Control', 'public, max-age=300');
            return svg;
        }
    );
}
