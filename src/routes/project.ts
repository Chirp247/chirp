// Project info endpoint: GET /api/v1/project/:name
import { FastifyInstance } from 'fastify';
import { query } from '../db';
import { ProjectInfo } from '../types';

function extractRows(result: any): any[] {
    if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
        return result[0];
    }
    if (Array.isArray(result)) {
        return result;
    }
    return [];
}

export async function projectRoutes(app: FastifyInstance) {
    app.get<{ Params: { name: string } }>('/:name', async (request, reply) => {
        const { name } = request.params;

        const projectResult = await query(
            'SELECT id, name, displayName, public, apiKey FROM projects WHERE name = ?',
            [name]
        );
        const projects = extractRows(projectResult) as Array<{ id: string; name: string; displayName: string | null; public: boolean; apiKey: string }>;

        if (!projects || projects.length === 0) {
            reply.status(404);
            return { error: 'Project not found' };
        }

        const project = projects[0];

        if (!project.public) {
            const apiKey = request.headers['x-chirp-key'];
            if (apiKey !== project.apiKey) {
                reply.status(403);
                return { error: 'Project is private' };
            }
        }

        const eventResult = await query(
            'SELECT DISTINCT event FROM rollups WHERE projectId = ?',
            [project.id]
        );
        const eventRows = extractRows(eventResult) as Array<{ event: string }>;
        const eventNames = eventRows.map(r => r.event);

        const events: ProjectInfo['events'] = [];
        for (const eventName of eventNames) {
            const dimResult = await query(
                'SELECT DISTINCT dimKey FROM rollups WHERE projectId = ? AND event = ? AND dimKey IS NOT NULL',
                [project.id, eventName]
            );
            const dimRows = extractRows(dimResult) as Array<{ dimKey: string }>;
            const dimensions = dimRows.map(r => r.dimKey);

            const countResult = await query(
                'SELECT CAST(COALESCE(SUM(count), 0) AS SIGNED) as total FROM rollups WHERE projectId = ? AND event = ? AND dimKey IS NULL',
                [project.id, eventName]
            );
            const countRows = extractRows(countResult) as Array<{ total: number }>;
            const totalCount = countRows.length > 0 ? Number(countRows[0].total) : 0;

            events.push({ name: eventName, dimensions, totalCount });
        }

        const firstResult = await query(
            'SELECT CAST(MIN(day) AS CHAR) as firstDay FROM rollups WHERE projectId = ?',
            [project.id]
        );
        const firstRows = extractRows(firstResult) as Array<{ firstDay: string | null }>;
        const firstDay = firstRows.length > 0 ? firstRows[0].firstDay : null;

        const totalResult = await query(
            'SELECT CAST(COALESCE(SUM(count), 0) AS SIGNED) as total FROM rollups WHERE projectId = ? AND dimKey IS NULL',
            [project.id]
        );
        const totalRows = extractRows(totalResult) as Array<{ total: number }>;
        const totalCount = totalRows.length > 0 ? Number(totalRows[0].total) : 0;

        const info: ProjectInfo = {
            name: project.name,
            displayName: project.displayName,
            events,
            firstEvent: firstDay ? String(firstDay).split('T')[0] : null,
            totalCount,
        };

        return info;
    });
}
