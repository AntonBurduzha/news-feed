import cron, { ScheduledTask } from 'node-cron';
import { messagesOutboxService } from '@/modules/messages-outbox/messages-outbox.service';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import { db } from '@/db/postgres';

let task: ScheduledTask | null = null;
let shuttingDown = false;
let activeCleanup: Promise<void> | null = null;

async function runCleanup(): Promise<void> {
	if (shuttingDown) return;

	logger.info('Running outbox cleanup');
	try {
		await messagesOutboxService.cleanUpSentMessages();
		logger.info('Outbox cleanup completed');
	} catch (error) {
		logger.error({ err: normalizeError(error) }, 'Outbox cleanup failed');
	}
}

async function run(): Promise<void> {
	logger.info('Starting outbox cleaner worker');
	activeCleanup = runCleanup().finally(() => {
		activeCleanup = null;
	});
	task = cron.schedule('* * * * *', () => {
		activeCleanup = runCleanup().finally(() => {
			activeCleanup = null;
		});
	});
	logger.info('Outbox cleaner worker started');
}

async function shutdown(reason: string, error?: unknown): Promise<void> {
	if (shuttingDown) return;
	shuttingDown = true;

	if (error) {
		logger.error(
			{ err: normalizeError(error), reason },
			'Shutting down outbox cleaner after error',
		);
	} else {
		logger.info({ reason }, 'Shutting down outbox cleaner');
	}

	if (task) {
		await task.stop();
		task = null;
	}

	if (activeCleanup) {
		logger.info('Waiting for in-flight cleanup to complete');
		await activeCleanup.catch(() => {});
	}

	await db.end().catch(dbError => {
		logger.error({ err: normalizeError(dbError) }, 'Failed to close database pool');
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

void run().catch(error => {
	logger.error({ err: normalizeError(error) }, 'Outbox cleaner worker failed to start');
	process.exitCode = 1;
});
