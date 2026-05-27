// MySQL Database Connection — via @perryts/mysql, a pure-TypeScript
// wire-protocol driver that compiles natively under Perry. Replaces mysql2,
// whose native binding's pool handle went stale under Perry and silently
// wedged the service (all queries failing while the process stayed alive).
import { Pool } from '@perryts/mysql';
import { config } from './config';

function buildUrl(): string {
    return 'mysql://' + config.mysql.user + ':' + config.mysql.password +
        '@' + config.mysql.host + ':' + config.mysql.port + '/' + config.mysql.database;
}

const pool: Pool = new Pool({
    url: buildUrl(),
    max: config.mysql.connectionLimit,
    idleTimeoutMs: 30000,
    acquireTimeoutMs: 30000,
    // localhost is non-TLS; needed for first-time caching_sha2_password auth.
    allowPublicKeyRetrieval: true,
});

// @perryts/mysql returns a single QueryResult object ({ rows, fields,
// rowCount, lastInsertId, ... }). The rest of the codebase expects mysql2's
// tuple shape — extractRows() expects [rows, fields] and handleCli destructures
// [okPacket] for affectedRows/insertId. Adapt the result to that tuple.
function toTuple(r: any): [any, any] {
    if (r && r.fields && r.fields.length > 0) {
        return [r.rows, r.fields];                 // result set (SELECT / SHOW)
    }
    return [
        { affectedRows: r ? r.rowCount : 0, insertId: r ? r.lastInsertId : 0 },
        r ? r.fields : [],
    ];                                             // OK packet (INSERT/UPDATE/DELETE/DDL)
}

export async function query(sql: string, params?: unknown[]): Promise<[any, any]> {
    const r = params ? await pool.query(sql, params) : await pool.query(sql);
    return toTuple(r);
}

export async function execute(sql: string, params?: unknown[]): Promise<[any, any]> {
    return query(sql, params);
}

export async function endPool() {
    await pool.end();
}
