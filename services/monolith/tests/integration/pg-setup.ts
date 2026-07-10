import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const run = promisify(execFile);
const monolithRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

let container: StartedPostgreSqlContainer | undefined;
let started = false;
let stopped = false;

export async function startPostgres() {
	if (started) return container!;

	container = await new PostgreSqlContainer('postgres:16-alpine')
		.withDatabase('test')
		.withUsername('test')
		.withPassword('test')
		.start();

	process.env.NODE_ENV = 'test';
	process.env.POSTGRES_DB_HOST = container.getHost();
	process.env.POSTGRES_DB_PORT = String(container.getMappedPort(5432));
	process.env.POSTGRES_DB_USER = 'test';
	process.env.POSTGRES_DB_PASSWORD = 'test';
	process.env.POSTGRES_DB_NAME = 'test';
	process.env.KAFKA_NEWS_FEED_SERVICE_CLIENT_ID = 'test-client';
	process.env.AWS_REGION = 'us-east-1';
	process.env.AWS_BUCKET_NAME = 'test-bucket';
	process.env.INTERNAL_API_KEY = 'test-internal-api-key';

	await run('npm', ['run', 'migrate:postgres'], {
		cwd: monolithRoot,
		env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
	});

	started = true;
	return container;
}

export async function stopPostgres() {
	if (!started || stopped) return;
	stopped = true;

	const { db } = await import('@/db/postgres');
	await db.end().catch(() => {});
	await container?.stop();
}
