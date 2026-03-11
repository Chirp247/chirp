// MySQL Database Connection
import mysql from 'mysql2/promise';
import { config } from './config';

const uri = `mysql://${config.mysql.user}:${config.mysql.password}@${config.mysql.host}:${config.mysql.port}/${config.mysql.database}`;
const pool = mysql.createPool({ uri });

export async function query(sql: string, params?: unknown[]) {
    if (params) {
        return await pool.query(sql, params);
    }
    return await pool.query(sql);
}

export async function execute(sql: string, params?: unknown[]) {
    if (params) {
        return await pool.execute(sql, params);
    }
    return await pool.execute(sql);
}

export async function endPool() {
    await pool.end();
}
