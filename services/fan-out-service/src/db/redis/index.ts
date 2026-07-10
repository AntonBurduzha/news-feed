import { createClient, type RedisClientType } from 'redis';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';

export const redisClient: RedisClientType = createClient({ url: env.REDIS_URL });

redisClient.on('error', err => logger.error({ err }, 'Redis client error'));

export async function connectRedis(): Promise<void> {
	if (!redisClient.isOpen) {
		await redisClient.connect();
	}
	logger.info('Redis connected');
}
export async function disconnectRedis(): Promise<void> {
	if (redisClient.isOpen) {
		await redisClient.quit();
	}
	logger.info('Redis disconnected');
}
