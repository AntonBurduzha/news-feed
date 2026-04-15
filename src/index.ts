import type { Server } from 'node:http';
import app from '@/app';
import { env } from '@/config/env';
import { db } from '@/db/postgres';
import { kafkaAdmin } from '@/kafka/admin';
import { connectMongo, disconnectMongo } from '@/db/mongo';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import { followerPartitionsService } from '@/modules/follower-partitions/follower-partitions.service';

let server: Server | undefined;
let shuttingDown = false;

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

	await kafkaAdmin.disconnect().catch(adminError => {
		logger.error(
			{ err: normalizeError(adminError) },
			'Failed to disconnect Kafka admin during shutdown',
		);
	});

	await disconnectMongo().catch(mongoError => {
		logger.error(
			{ err: normalizeError(mongoError) },
			'Failed to close MongoDB connection during shutdown',
		);
	});

	await db.end().catch(dbError => {
		logger.error({ err: normalizeError(dbError) }, 'Failed to close database pool');
	});
}

async function start(): Promise<void> {
	await connectMongo();

	await kafkaAdmin.connect();

	await followerPartitionsService.reconcilePartitions();

	server = app
		.listen(env.PORT, () => {
			logger.info({ port: env.PORT }, 'HTTP server listening');
		})
		.on('error', error => {
			process.exitCode = 1;
			void shutdown('server_error', error);
		});
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
