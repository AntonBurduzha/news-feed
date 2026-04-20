import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import { KafkaTopics } from '@/kafka/topics';
import KafkaConsumer from '@/kafka/consumer';
import { commentsService } from '@/modules/comments/comments.service';
import { connectMongo, disconnectMongo } from '@/db/mongo';
import { kafkaProducer } from '@/kafka/producer';

async function run(): Promise<void> {
	logger.info('Starting delete-comments-consumer');

	const consumer = new KafkaConsumer(
		'delete-comments-consumer',
		env.KAFKA_BROKERS,
		'delete-comments-consumer-group',
	);
	await connectMongo();
	await consumer.connect();
	await consumer.subscribeAndListen(
		KafkaTopics.DeleteComments,
		async ({ message, topic, partition }) => {
			const { key, value } = message;
			try {
				const { postIds } = JSON.parse(value!.toString()) as { postIds: number[] };
				await commentsService.deleteCommentsByPostIds(postIds);
				logger.info({ postIds }, 'Comments deleted for post IDs');
			} catch (error) {
				logger.error(
					{ err: normalizeError(error) },
					'Error consuming delete comments message, sending to DLQ',
				);
				await kafkaProducer.sendMessage(KafkaTopics.AppDLQ, [
					{
						key: key!.toString(),
						value: JSON.stringify(value),
						dlqReason: normalizeError(error).message,
						originalTopic: topic,
						originalPartition: partition,
						failedAt: new Date().toISOString(),
					},
				]);
			}
		},
	);

	const disconnectAndExit = async (signal?: string): Promise<void> => {
		try {
			logger.info({ signal }, 'Shutting down delete-comments-consumer');
			await disconnectMongo();
			await consumer.disconnect();
		} catch (error) {
			logger.error(
				{ err: normalizeError(error) },
				'Failed to disconnect delete-comments-consumer during shutdown',
			);
			process.exitCode = 1;
		}
		if (signal) {
			process.kill(process.pid, signal);
		}
	};

	process.on('unhandledRejection', error => {
		logger.error({ err: normalizeError(error) }, 'Unhandled rejection in delete-comments-consumer');
		void disconnectAndExit();
	});

	process.on('uncaughtException', error => {
		logger.error({ err: normalizeError(error) }, 'Uncaught exception in delete-comments-consumer');
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
	logger.error({ err: normalizeError(error) }, 'delete-comments-consumer failed to start');
	process.exitCode = 1;
});
