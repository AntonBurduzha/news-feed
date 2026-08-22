import type { Server } from 'node:http';
import { sleep } from '@news-feed/runtime';
import app from '@/app';
import { env } from '@/config/env';
import { checkPostgresConnection, disconnectPostgres, startPgPoolMetrics } from '@/db/postgres';
import { connectRedis, disconnectRedis, isRedisHealthy } from '@/db/redis';
import { backgroundSupervisor, startSupervisorMetrics } from '@/lib/background-supervisor';
import { beginDraining, isDraining } from '@/lib/lifecycle';
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

async function closeHttpServer(): Promise<void> {
	if (!server) {
		return;
	}
	const httpServer = server;

	await new Promise<void>(resolve => {
		const forceClose = setTimeout(() => {
			logger.warn(
				{ timeoutMs: env.SHUTDOWN_TIMEOUT_MS },
				'In-flight requests did not finish in time; destroying remaining connections',
			);
			httpServer.closeAllConnections();
		}, env.SHUTDOWN_TIMEOUT_MS);
		forceClose.unref();

		httpServer.close(() => {
			clearTimeout(forceClose);
			resolve();
		});

		httpServer.closeIdleConnections();
	});
}

async function shutdown(reason: string, error?: unknown): Promise<void> {
	if (isDraining()) {
		return;
	}
	beginDraining();

	if (error) {
		logger.error({ err: normalizeError(error), reason }, 'Shutting down after error');
	} else {
		logger.info({ reason }, 'Shutting down');
	}

	if (!error && env.SHUTDOWN_DRAIN_MS > 0) {
		logger.info({ drainMs: env.SHUTDOWN_DRAIN_MS }, 'Draining: /readyz returns 503');
		await sleep(env.SHUTDOWN_DRAIN_MS);
	}

	await closeHttpServer();
	await backgroundSupervisor.stop();

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
