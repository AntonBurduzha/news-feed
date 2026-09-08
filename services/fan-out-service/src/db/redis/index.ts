import { createClient, type RedisClientType } from 'redis';
import { attachRedisLogging, createRedisReconnectStrategy } from '@news-feed/runtime';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';

export { isRedisDown } from '@news-feed/runtime';

export const redisClient: RedisClientType = createClient({
	url: env.REDIS_URL,
	disableOfflineQueue: true,
	socket: {
		connectTimeout: 2000,
		reconnectStrategy: createRedisReconnectStrategy(),
	},
});

attachRedisLogging(redisClient, logger, { component: env.SERVICE_NAME });

export async function connectRedis(): Promise<void> {
	if (!redisClient.isOpen) {
		await redisClient.connect();
	}
}

export function isRedisHealthy(): boolean {
	return redisClient.isReady;
}

export async function disconnectRedis(): Promise<void> {
	if (redisClient.isOpen) {
		await redisClient.quit();
	}
}
