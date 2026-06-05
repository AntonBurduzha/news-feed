import type { Request, RequestHandler } from 'express';
import { createClient, type RedisClientType } from 'redis';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { trace } from '@opentelemetry/api';
import client from 'prom-client';

export type UserContext = {
	userId: string;
	tokenExp: number;
};

export interface AuthClient {
	verify(bearer: string): Promise<UserContext>;
	middleware(opts?: { optional?: boolean }): RequestHandler;
	//redis: RedisClientType;
	disconnect(): Promise<void>;
}

export const redisCacheHitsTotal = new client.Counter({
	name: 'redis_cache_hits_total',
	help: 'Redis cache hits',
	labelNames: ['operation', 'service'] as const,
});

export const redisCacheMissesTotal = new client.Counter({
	name: 'redis_cache_misses_total',
	help: 'Redis cache misses',
	labelNames: ['operation', 'service'] as const,
});

export function createAuthClient(cfg: {
	jwksUrl: string;
	issuer: string;
	audience: string;
	redisUrl: string;
}): AuthClient {
	const jwks = createRemoteJWKSet(new URL(cfg.jwksUrl));
	const redisClient: RedisClientType = createClient({ url: cfg.redisUrl });
	redisClient.on('error', err => {
		console.error('createAuthClient: Redis connection error', err);
	});
	void redisClient.connect();

	async function verify(bearer: string): Promise<UserContext> {
		const token = bearer.replace(/^Bearer\s+/i, '');
		const span = trace.getActiveSpan();
		try {
			const cached = await redisClient.get(`auth:${token}`);
			if (cached) {
				span?.addEvent('jwks.cache_hit');
				redisCacheHitsTotal.inc({ operation: 'verify', service: cfg.audience });
				return JSON.parse(cached) as UserContext;
			}
		} catch {
			// Redis down, continue without caching
		}
		span?.addEvent('jwks.cache_miss', { jwksUrl: cfg.jwksUrl });
		redisCacheMissesTotal.inc({ operation: 'verify', service: cfg.audience });
		const { payload } = await jwtVerify(token, jwks, {
			audience: cfg.audience,
			issuer: cfg.issuer,
		});
		const ctx: UserContext = {
			userId: payload.sub!,
			tokenExp: payload.exp!,
		};
		try {
			// INFO: Cache result for 60 seconds or until token expires, which is shorter
			const ttl = Math.max(0, Math.min(60, ctx.tokenExp - Math.floor(Date.now() / 1000)));
			if (ttl > 0) {
				await redisClient.set(`auth:${token}`, JSON.stringify(ctx), { EX: ttl });
			}
		} catch {
			// Redis down, continue without caching
		}

		return ctx;
	}

	const middleware: AuthClient['middleware'] =
		(opts = {}) =>
		async (req, res, next) => {
			const header = req.headers['authorization'];
			if (!header) {
				if (opts.optional) {
					return next();
				}
				return res.status(401).json({ error: 'Missing token' });
			}
			try {
				(req as Request & { user: UserContext }).user = await verify(header);
				next();
			} catch {
				res.status(401).json({ error: 'Invalid token' });
			}
		};

	async function disconnect(): Promise<void> {
		await redisClient.quit().catch(err => {
			console.error('createAuthClient: Redis disconnect error', err);
		});
	}

	return { verify, middleware, disconnect };
}
