import 'dotenv/config';
export const config = { port: process.env.PORT || 4000, jwtSecret: process.env.JWT_SECRET || 'change-this-demo-secret', redisUrl: process.env.REDIS_URL || 'redis://localhost:6379' };
