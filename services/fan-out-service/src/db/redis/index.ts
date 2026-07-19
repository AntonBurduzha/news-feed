import { createClient, type RedisClientType } from 'redis';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';

export const redisClient: RedisClientType = createClient({
	url: env.REDIS_URL,
	disableOfflineQueue: true,
	socket: {
		connectTimeout: 500,
		reconnectStrategy: retries => Math.min(retries * 50, 2000),
	},
});

redisClient.on('error', err => logger.error({ err }, 'Redis client error'));

export async function connectRedis(): Promise<void> {
	if (!redisClient.isOpen) {
		await redisClient.connect();
		logger.info('Redis connected');
	}
}

export async function disconnectRedis(): Promise<void> {
	if (redisClient.isOpen) {
		await redisClient.quit();
	}
	logger.info('Redis disconnected');
}

export function isRedisDown(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	const name = error.name;
	const errors = [
		'ClientClosedError',
		'ClientOfflineError',
		'ConnectionTimeoutError',
		'SocketClosedUnexpectedlyError',
	];
	if (errors.includes(name)) {
		return true;
	}
	const message = error.message;
	return /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|connection is closed|offline/i.test(message);
}
