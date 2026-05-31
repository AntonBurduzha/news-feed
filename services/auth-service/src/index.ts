import type { Server } from 'node:http';
import app from '@/app';
import { env } from '@/config/env';
import { checkPostgresConnection, startPgPoolMetrics } from '@/db/postgres';
import { connectRedis, disconnectRedis } from '@/db/redis';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';

let server: Server | undefined;
let shuttingDown = false;

async function start(): Promise<void> {
	await checkPostgresConnection();
	startPgPoolMetrics();
	await connectRedis();

	server = app
		.listen(env.PORT, () => {
			logger.info({ serviceName: env.SERVICE_NAME }, `ready on port ${env.PORT}`);
		})
		.on('error', error => {
			process.exitCode = 1;
			void shutdown('server_error', error);
		});
}

async function shutdown(reason: string, error?: unknown): Promise<void> {
	if (shuttingDown) {
		return;
	}

	shuttingDown = true;

	if (error) {
		logger.error({ err: normalizeError(error), reason }, 'Shutting down after error');
	} else {
		logger.info({ reason }, 'Shutting down');
	}

	await new Promise<void>(resolve => {
		if (!server) {
			resolve();
			return;
		}
		server.close(() => resolve());
	});

	const disposables: Array<[string, () => Promise<unknown>]> = [['Redis', () => disconnectRedis()]];
	for (const [label, close] of disposables) {
		await close().catch(err => {
			logger.error({ err: normalizeError(err) }, `Failed to disconnect ${label}`);
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
