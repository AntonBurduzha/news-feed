import type { Server } from 'node:http';
import app, { authClient } from '@/app';
import { env } from '@/config/env';
import { db, checkPostgresConnection, startPgPoolMetrics } from '@/db/postgres';
// import { initPostgresDB, dropPostgresDB } from '@/db/postgres/init-postgres-db';
import { kafkaAdmin } from '@/kafka/admin';
import { backgroundSupervisor, startMonolithSupervisorMetrics } from '@/lib/background-supervisor';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';

let server: Server | undefined;

async function shutdown(reason: string, error?: unknown): Promise<void> {
	if (backgroundSupervisor.isShuttingDown()) {
		return;
	}

	if (error) {
		logger.error({ err: normalizeError(error), reason }, 'Shutting down after error');
	} else {
		logger.info({ reason }, 'Shutting down');
	}

	await backgroundSupervisor.stop();

	await new Promise<void>(resolve => {
		if (!server) {
			resolve();
			return;
		}

		server.close(() => resolve());
	});

	const disposables: Array<[string, () => Promise<unknown>]> = [
		['Auth client', () => authClient.disconnect()],
		['Postgres pool', () => db.end()],
	];
	for (const [label, close] of disposables) {
		await close().catch(err => {
			logger.error({ err: normalizeError(err) }, `Failed to disconnect ${label} during shutdown`);
		});
	}
}

async function start(): Promise<void> {
	await checkPostgresConnection();
	// await initPostgresDB();
	// await dropPostgresDB();
	startPgPoolMetrics();

	server = app
		.listen(env.PORT, () => {
			logger.info({ port: env.PORT }, 'HTTP server listening');
		})
		.on('error', error => {
			process.exitCode = 1;
			void shutdown('server_error', error);
		});

	backgroundSupervisor.start({
		name: 'Kafka admin',
		run: () => kafkaAdmin.connect(),
		cleanup: () => kafkaAdmin.disconnect(),
	});

	startMonolithSupervisorMetrics();
}

process.on('uncaughtException', error => {
	process.exitCode = 1;
	void shutdown('uncaught_exception', error);
});

process.on('unhandledRejection', error => {
	process.exitCode = 1;
	void shutdown('unhandled_rejection', error);
});

process.on('SIGINT', () => {
	process.exitCode = 0;
	void shutdown('sigint');
});

process.on('SIGTERM', () => {
	process.exitCode = 0;
	void shutdown('sigterm');
});

void start().catch(async error => {
	process.exitCode = 1;
	await shutdown('startup_failed', error);
});
