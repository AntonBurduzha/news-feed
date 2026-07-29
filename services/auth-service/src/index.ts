import type { Server } from 'node:http';
import app from '@/app';
import { env } from '@/config/env';
import { checkPostgresConnection, disconnectPostgres, startPgPoolMetrics } from '@/db/postgres';
import { connectRedis, disconnectRedis, isRedisHealthy } from '@/db/redis';
import { backgroundSupervisor, startSupervisorMetrics } from '@/lib/background-supervisor';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';

let server: Server | undefined;

async function start(): Promise<void> {
	await checkPostgresConnection();
	startPgPoolMetrics();

	server = app
		.listen(env.PORT, () => {
			logger.info({ serviceName: env.SERVICE_NAME }, `ready on port ${env.PORT}`);
		})
		.on('error', error => {
			process.exitCode = 1;
			void shutdown('server_error', error);
		});

	backgroundSupervisor.start({
		name: 'Redis',
		run: connectRedis,
		check: isRedisHealthy,
		onUnhealthy: 'report',
		cleanup: disconnectRedis,
	});

	startSupervisorMetrics();
}

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
		['Postgres pool', () => disconnectPostgres()],
	];
	for (const [label, close] of disposables) {
		await close().catch(err => {
			logger.error({ err: normalizeError(err) }, `Failed to disconnect ${label} during shutdown`);
		});
	}
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
