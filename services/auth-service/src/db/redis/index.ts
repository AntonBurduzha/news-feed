import { createClient, type RedisClientType } from 'redis';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';

export const redisClient: RedisClientType = createClient({
	url: env.REDIS_URL,
});

redisClient.on('error', err => {
	logger.error({ err }, 'Redis connection error');
});

export async function connectRedis(): Promise<void> {
	await redisClient.connect();
	logger.info('Redis connected');
}

export async function disconnectRedis(): Promise<void> {
	await redisClient.quit();
}

export async function cacheToken(token: string, userId: string, ttlSeconds: number): Promise<void> {
	try {
		await redisClient.set(`auth:${token}`, JSON.stringify({ userId }), { EX: ttlSeconds });
	} catch (error) {
		logger.warn({ err: normalizeError(error) }, 'Failed to cache token, continue without cache');
	}
}

export async function getCachedToken(token: string): Promise<{ userId: string } | null> {
	try {
		const cachedToken = await redisClient.get(`auth:${token}`);
		return cachedToken ? (JSON.parse(cachedToken) as { userId: string }) : null;
	} catch {
		return null;
	}
}
