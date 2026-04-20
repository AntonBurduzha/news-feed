import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import { KafkaTopics } from '@/kafka/topics';
import KafkaConsumer from '@/kafka/consumer';
import { kafkaProducer } from '@/kafka/producer';
import { followerPartitionsService } from '@/modules/follower-partitions/follower-partitions.service';

// Usage: tsx consumer.ts -- --followerId=1
function parseArgs(): { followerId: number } {
	const args = process.argv.slice(2);

	let followerId: number | undefined;

	for (const arg of args) {
		if (arg.startsWith('--followerId=')) {
			followerId = parseInt(arg.split('=')[1], 10);
		}
	}

	if (followerId === undefined || Number.isNaN(followerId)) {
		throw new Error(
			'Missing or invalid --followerId argument. Usage: tsx consumer.ts --followerId=1',
		);
	}

	return { followerId };
}

async function run(): Promise<void> {
	const { followerId } = parseArgs();

	logger.info({ followerId }, 'Starting posts-create-consumer for follower');

	const partitionIndex = await followerPartitionsService.getPartitionForFollower(followerId);
	if (partitionIndex === null) {
		throw new Error(
			`No partition assignment found for follower ${followerId}. Ensure the follower has been assigned a partition before starting the consumer.`,
		);
	}

	logger.info({ followerId, partitionIndex }, 'Resolved partition assignment for follower');

	const consumer = new KafkaConsumer(
		`posts-create-consumer-${followerId}`,
		env.KAFKA_BROKERS,
		'posts-create-group',
		partitionIndex,
	);
	await consumer.connect();
	await consumer.subscribeAndListen(
		KafkaTopics.CreatePost,
		async ({ message, topic, partition }) => {
			const { key, value } = message;
			try {
				// TODO: Implement posts-create-consumer logic
			} catch (error) {
				logger.error(
					{ err: normalizeError(error) },
					'Error consuming create post message, sending to DLQ',
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
			logger.info({ followerId, signal }, 'Shutting down consumer');
			await consumer.disconnect();
		} catch (error) {
			logger.error(
				{ err: normalizeError(error), followerId },
				'Failed to disconnect Kafka consumer during shutdown',
			);
			process.exitCode = 1;
		}

		if (signal) {
			process.kill(process.pid, signal);
		}
	};

	process.on('unhandledRejection', error => {
		logger.error({ err: normalizeError(error), followerId }, 'Unhandled rejection in consumer');
		void disconnectAndExit();
	});

	process.on('uncaughtException', error => {
		logger.error({ err: normalizeError(error), followerId }, 'Uncaught exception in consumer');
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
	logger.error({ err: normalizeError(error) }, 'Kafka consumer failed to start');
	process.exitCode = 1;
});
