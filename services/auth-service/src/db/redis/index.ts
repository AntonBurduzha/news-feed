import { createClient, type RedisClientType } from 'redis';
import { attachRedisLogging } from '@news-feed/runtime';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';

export const redisClient: RedisClientType = createClient({
	url: env.REDIS_URL,
	socket: {
		reconnectStrategy: retries => Math.min(retries * 50, 2_000),
	},
});

attachRedisLogging(redisClient, logger, { component: env.SERVICE_NAME });

export async function connectRedis(): Promise<void> {
	if (!redisClient.isOpen) {
		await redisClient.connect();
	}
}

export async function disconnectRedis(): Promise<void> {
	if (redisClient.isOpen) {
		await redisClient.quit();
	}
}

export function isRedisHealthy(): boolean {
	return redisClient.isReady;
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
