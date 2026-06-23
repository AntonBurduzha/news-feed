import client from 'prom-client';
import { env } from '@/config/env';

if (!env.isTest) {
	client.collectDefaultMetrics({ prefix: 'nodejs_' });
}

export const httpRequestsTotal = new client.Counter({
	name: 'http_requests_total',
	help: 'Total HTTP requests',
	labelNames: ['method', 'route', 'status_code', 'service'] as const,
});

export const httpRequestDuration = new client.Histogram({
	name: 'http_request_duration_seconds',
	help: 'HTTP request duration in seconds',
	labelNames: ['method', 'route', 'status_code', 'service'] as const,
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const httpRequestErrorsTotal = new client.Counter({
	name: 'http_request_errors_total',
	help: 'Total HTTP 5xx responses',
	labelNames: ['method', 'route', 'service'] as const,
});

export const authTokensIssuedTotal = new client.Counter({
	name: 'auth_tokens_issued_total',
	help: 'Tokens issued',
	labelNames: ['type', 'service'] as const,
});

export const authFailuresTotal = new client.Counter({
	name: 'auth_failures_total',
	help: 'Authentication failures',
	labelNames: ['reason', 'service'] as const,
});

export const pgPoolConnections = new client.Gauge({
	name: 'pg_pool_connections',
	help: 'Postgres connection pool state',
	labelNames: ['state', 'service'] as const,
});
