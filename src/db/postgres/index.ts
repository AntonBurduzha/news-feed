import { Pool, PoolClient } from 'pg';
import { env } from '@/config/env';

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
