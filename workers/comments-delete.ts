import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import { KafkaTopics } from '@/kafka/topics';
import KafkaConsumer from '@/kafka/consumer';
import { commentsService } from '@/modules/comments/comments.service';
import { connectMongo, disconnectMongo } from '@/db/mongo';

async function run(): Promise<void> {
	logger.info('Starting comments-delete-consumer');

	const consumer = new KafkaConsumer(
		'comments-delete-consumer',
		env.KAFKA_BROKERS,
		'comments-delete-consumer-group',
	);
	await connectMongo();
	await consumer.connect();
	await consumer.subscribeAndListen(KafkaTopics.CommentsDelete, async payload => {
		const { value } = payload.message;
		const { postIds } = JSON.parse(value!.toString()) as { postIds: number[] };
		await commentsService.deleteCommentsByPostIds(postIds);
		logger.info({ postIds }, 'Comments deleted for post IDs');
	});

	const disconnectAndExit = async (signal?: string): Promise<void> => {
		try {
			logger.info({ signal }, 'Shutting down comments-delete-consumer');
			await disconnectMongo();
			await consumer.disconnect();
		} catch (error) {
			logger.error(
				{ err: normalizeError(error) },
				'Failed to disconnect comments-delete-consumer during shutdown',
			);
			process.exitCode = 1;
		}
		if (signal) {
			process.kill(process.pid, signal);
		}
	};

	process.on('unhandledRejection', error => {
		logger.error({ err: normalizeError(error) }, 'Unhandled rejection in comments-delete-consumer');
		void disconnectAndExit();
	});

	process.on('uncaughtException', error => {
		logger.error({ err: normalizeError(error) }, 'Uncaught exception in comments-delete-consumer');
		void disconnectAndExit();
	});

	const signalTraps: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
	for (const signal of signalTraps) {
		process.once(signal, () => {
			void disconnectAndExit(signal);
		});
	}
}

void run().catch(error => {
	logger.error({ err: normalizeError(error) }, 'comments-delete-consumer failed to start');
	process.exitCode = 1;
});
