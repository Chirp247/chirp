// Configuration
import dotenv from 'dotenv';

dotenv.config();

export const config = {
    port: parseInt(process.env.PORT || '3000', 10),
    logLevel: process.env.LOG_LEVEL || 'info',

    mysql: {
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT || '3306', 10),
        database: process.env.MYSQL_DATABASE || 'chirp',
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || 'password',
        connectionLimit: 10,
    },

    rateLimit: {
        ipPerHour: parseInt(process.env.RATE_LIMIT_IP_PER_HOUR || '200', 10),
        projectPerDay: parseInt(process.env.RATE_LIMIT_PROJECT_PER_DAY || '100000', 10),
        clientPerHour: parseInt(process.env.RATE_LIMIT_CLIENT_PER_HOUR || '500', 10),
    },

    retentionDays: parseInt(process.env.RETENTION_DAYS || '90', 10),
};
