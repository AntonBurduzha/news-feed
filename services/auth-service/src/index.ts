import type { Server } from 'node:http';
import { BackgroundSupervisor } from '@news-feed/runtime';
import app from '@/app';
import { env } from '@/config/env';
import { checkPostgresConnection, disconnectPostgres, startPgPoolMetrics } from '@/db/postgres';
import { connectRedis, disconnectRedis } from '@/db/redis';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';

let server: Server | undefined;

const backgroundSupervisor = new BackgroundSupervisor({
	logger: {
		info: (obj, msg) => logger.info(obj, msg),
		warn: (obj, msg) => logger.warn(obj, msg),
		error: (obj, msg) => logger.error(obj, msg),
	},
});

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
		mode: 'once',
		run: connectRedis,
		cleanup: disconnectRedis,
	});
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
		['Redis', () => disconnectRedis()],
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
