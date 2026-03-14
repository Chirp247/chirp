// Chirp — Lightweight telemetry service
import Fastify, { FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { config } from './config';
import { query, execute, endPool } from './db';
import { ingestRoutes } from './routes/ingest';
import { queryRoutes } from './routes/query';
import { projectRoutes } from './routes/project';
import { badgeRoutes } from './routes/badge';
import { dashboardRoutes } from './routes/dashboard';
import { startRollupScheduler, runRollup, pruneOldEvents } from './services/rollup';

const app: FastifyInstance = Fastify({
    logger: {
        level: config.logLevel,
    },
});

// CLI admin commands
const args = process.argv.slice(2);
if (args.length > 0) {
    handleCli(args).then(() => process.exit(0)).catch(err => {
        console.error(err);
        process.exit(1);
    });
} else {
    main();
}

async function main() {
    // CORS headers (inline — @fastify/cors not available in Perry)
    app.addHook('onRequest', async (request, reply) => {
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Chirp-Key, X-Chirp-Signature, X-Chirp-Client');
        if (request.method === 'OPTIONS') {
            reply.status(204);
            reply.send('');
        }
    });

    // Health check
    app.get('/health', async (request, reply) => {
        try {
            await query('SELECT 1');
            return {
                status: 'healthy',
                mysql: 'connected',
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            reply.status(503);
            return { status: 'unhealthy', error: 'Service unavailable' };
        }
    });

    // Register routes
    await app.register(ingestRoutes, { prefix: '/api/v1' });
    await app.register(queryRoutes, { prefix: '/api/v1' });
    await app.register(projectRoutes, { prefix: '/api/v1/project' });
    await app.register(badgeRoutes, { prefix: '/badge' });
    await app.register(dashboardRoutes, { prefix: '/p' });

    // Start rollup scheduler
    startRollupScheduler();

    // Start server
    try {
        await app.listen({ port: config.port, host: '0.0.0.0' });
        console.log(`Chirp server running on port ${config.port}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await app.close();
    await endPool();
    process.exit(0);
});

// CLI admin handler
async function handleCli(args: string[]) {
    const command = args[0];

    if (command === 'project') {
        const subcommand = args[1];

        if (subcommand === 'create') {
            const nameIdx = args.indexOf('--name');
            const displayIdx = args.indexOf('--display');

            if (nameIdx === -1 || !args[nameIdx + 1]) {
                console.error('Usage: chirp project create --name <name> [--display "Display Name"]');
                return;
            }

            const name = args[nameIdx + 1];
            const displayName = displayIdx !== -1 ? args[displayIdx + 1] : null;
            const id = uuidv4();
            const apiKey = crypto.createHmac('sha256', uuidv4()).update(uuidv4()).digest('hex');
            const hmacSecret = crypto.createHmac('sha256', uuidv4()).update(uuidv4()).digest('hex');

            await query(
                'INSERT INTO projects (id, name, displayName, apiKey, hmacSecret) VALUES (?, ?, ?, ?, ?)',
                [id, name, displayName, apiKey, hmacSecret]
            );

            console.log('Project created:');
            console.log(`  ID:          ${id}`);
            console.log(`  Name:        ${name}`);
            console.log(`  Display:     ${displayName || '(none)'}`);
            console.log(`  API Key:     ${apiKey}`);
            console.log(`  HMAC Secret: ${hmacSecret}`);
        } else if (subcommand === 'list') {
            const [rows] = await query('SELECT id, name, displayName, apiKey, public, createdAt FROM projects ORDER BY createdAt');
            const projects = rows as Array<Record<string, unknown>>;

            if (projects.length === 0) {
                console.log('No projects found.');
                return;
            }

            for (const p of projects) {
                console.log(`${p.name} (${p.id})`);
                console.log(`  Display:  ${p.displayName || '(none)'}`);
                console.log(`  API Key:  ${p.apiKey}`);
                console.log(`  Public:   ${p.public}`);
                console.log(`  Created:  ${p.createdAt}`);
                console.log('');
            }
        } else if (subcommand === 'rotate-key') {
            const nameIdx = args.indexOf('--name');
            if (nameIdx === -1 || !args[nameIdx + 1]) {
                console.error('Usage: chirp project rotate-key --name <name>');
                return;
            }

            const name = args[nameIdx + 1];
            const newApiKey = crypto.createHmac('sha256', uuidv4()).update(uuidv4()).digest('hex');
            const newHmacSecret = crypto.createHmac('sha256', uuidv4()).update(uuidv4()).digest('hex');

            const [result] = await query(
                'UPDATE projects SET apiKey = ?, hmacSecret = ? WHERE name = ?',
                [newApiKey, newHmacSecret, name]
            );

            const updateResult = result as { affectedRows: number };
            if (updateResult.affectedRows === 0) {
                console.error(`Project "${name}" not found.`);
                return;
            }

            console.log(`Keys rotated for ${name}:`);
            console.log(`  New API Key:     ${newApiKey}`);
            console.log(`  New HMAC Secret: ${newHmacSecret}`);
        } else {
            console.error('Usage: chirp project <create|list|rotate-key>');
        }
    } else if (command === 'rollup') {
        const subcommand = args[1];

        if (subcommand === 'run') {
            const dateArg = args[2]; // optional specific date
            await runRollup(dateArg);
            console.log('Rollup complete.');
        } else {
            console.error('Usage: chirp rollup run [YYYY-MM-DD]');
        }
    } else if (command === 'prune') {
        const olderIdx = args.indexOf('--older-than');
        if (olderIdx !== -1 && args[olderIdx + 1]) {
            const match = args[olderIdx + 1].match(/^(\d+)d$/);
            if (match) {
                const days = parseInt(match[1], 10);
                const [result] = await query(
                    'DELETE FROM events WHERE timestamp < DATE_SUB(NOW(), INTERVAL ? DAY)',
                    [days]
                );
                const deleteResult = result as { affectedRows: number };
                console.log(`Pruned ${deleteResult.affectedRows} events older than ${days} days.`);
            } else {
                console.error('Format: --older-than <N>d (e.g. 90d)');
            }
        } else {
            await pruneOldEvents();
            console.log('Pruned events older than configured retention period.');
        }
    } else {
        console.error('Chirp — Lightweight telemetry service');
        console.error('');
        console.error('Usage:');
        console.error('  chirp                                          Start server');
        console.error('  chirp project create --name <n> [--display <d>]  Create project');
        console.error('  chirp project list                             List projects');
        console.error('  chirp project rotate-key --name <n>            Rotate API keys');
        console.error('  chirp rollup run [YYYY-MM-DD]                  Run rollup');
        console.error('  chirp prune --older-than <N>d                  Prune old events');
    }

    await endPool();
}

export { app };
