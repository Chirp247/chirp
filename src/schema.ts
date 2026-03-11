// Database schema migrations
import { Pool } from './db';

export async function runMigrations(db: Pool) {
    await db.query(`
        CREATE TABLE IF NOT EXISTS projects (
            id           VARCHAR(36) PRIMARY KEY,
            name         VARCHAR(100) NOT NULL UNIQUE,
            displayName  VARCHAR(200),
            apiKey       VARCHAR(64) NOT NULL UNIQUE,
            hmacSecret   VARCHAR(64) NOT NULL,
            public       BOOLEAN DEFAULT TRUE,
            createdAt    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS events (
            id          BIGINT AUTO_INCREMENT PRIMARY KEY,
            projectId   VARCHAR(36) NOT NULL,
            event       VARCHAR(100) NOT NULL,
            dim1Key     VARCHAR(50),
            dim1Val     VARCHAR(200),
            dim2Key     VARCHAR(50),
            dim2Val     VARCHAR(200),
            dim3Key     VARCHAR(50),
            dim3Val     VARCHAR(200),
            dim4Key     VARCHAR(50),
            dim4Val     VARCHAR(200),
            clientId    VARCHAR(64),
            timestamp   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idxProjectEventTs (projectId, event, timestamp),
            INDEX idxProjectTs (projectId, timestamp),
            FOREIGN KEY (projectId) REFERENCES projects(id)
        )
    `);

    await db.query(`
        CREATE TABLE IF NOT EXISTS rollups (
            id             BIGINT AUTO_INCREMENT PRIMARY KEY,
            projectId      VARCHAR(36) NOT NULL,
            event          VARCHAR(100) NOT NULL,
            dimKey         VARCHAR(50),
            dimVal         VARCHAR(200),
            day            DATE NOT NULL,
            count          INT NOT NULL DEFAULT 0,
            uniqueClients  INT NOT NULL DEFAULT 0,
            UNIQUE INDEX idxRollup (projectId, event, dimKey, dimVal, day),
            FOREIGN KEY (projectId) REFERENCES projects(id)
        )
    `);

    console.log('Database migrations complete');
}
