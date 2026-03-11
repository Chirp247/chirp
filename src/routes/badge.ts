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

            const now = new Date();
            let fromDate: string;
            switch (period) {
                case '7d':
                    now.setDate(now.getDate() - 7);
                    fromDate = now.toISOString().split('T')[0];
                    break;
                case '90d':
                    now.setDate(now.getDate() - 90);
                    fromDate = now.toISOString().split('T')[0];
                    break;
                case '12m':
                    now.setMonth(now.getMonth() - 12);
                    fromDate = now.toISOString().split('T')[0];
                    break;
                case 'all':
                    fromDate = '2020-01-01';
                    break;
                default:
                    now.setDate(now.getDate() - 30);
                    fromDate = now.toISOString().split('T')[0];
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
