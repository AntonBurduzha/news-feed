import { Pool, PoolClient } from 'pg';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { pgPoolConnections } from '@/lib/metrics';

export const db = new Pool({
	host: env.POSTGRES_DB_HOST,
	port: env.POSTGRES_DB_PORT,
	user: env.POSTGRES_DB_USER,
	password: env.POSTGRES_DB_PASSWORD,
	database: env.POSTGRES_DB_NAME,
	max: env.isProduction ? 20 : 10,
	idleTimeoutMillis: 30_000,
	connectionTimeoutMillis: 5_000,
});

export async function checkPostgresConnection(): Promise<void> {
	try {
		await db.query('SELECT 1');
		logger.info('PostgreSQL connection verified');
	} catch (err) {
		logger.error({ err }, 'Failed to verify PostgreSQL connection');
		throw err;
	}
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
	const client = await db.connect();
	try {
		await client.query('BEGIN');
		const result = await fn(client);
		await client.query('COMMIT');
		return result;
	} catch (err) {
		await client.query('ROLLBACK');
		throw err;
	} finally {
		client.release();
	}
}

export function startPgPoolMetrics(): void {
	setInterval(() => {
		// pg.Pool API: totalCount = all connections; idleCount = available in pool
		// waitingCount = requests queued waiting for a connection (saturation signal)
		pgPoolConnections.set(
			{ state: 'active', service: env.SERVICE_NAME },
			db.totalCount - db.idleCount, // connections currently executing a query
		);
		pgPoolConnections.set({ state: 'idle', service: env.SERVICE_NAME }, db.idleCount);
		pgPoolConnections.set({ state: 'waiting', service: env.SERVICE_NAME }, db.waitingCount);
	}, 15_000).unref(); // poll every 15s — balance freshness vs overhead
}
