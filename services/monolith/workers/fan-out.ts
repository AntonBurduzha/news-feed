import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { dlqMessagesTotal } from '@/lib/metrics';
import { normalizeError } from '@/lib/errors';
import { withRetry } from '@/lib/retry';
import { KafkaTopics } from '@/kafka/topics';
import KafkaConsumer from '@/kafka/consumer';
import { kafkaProducer } from '@/kafka/producer';
import { followerPartitionsService } from '@/modules/follower-partitions/follower-partitions.service';

function parseArgs(): { followerId: string } {
	const args = process.argv.slice(2);

	let followerId: string | undefined;

	for (const arg of args) {
		if (arg.startsWith('--followerId=')) {
			followerId = arg.split('=')[1];
		}
	}

	if (followerId === undefined) {
		throw new Error(
			'Missing --followerId argument. Usage: tsx workers/fan-out.ts -- --followerId=1',
		);
	}

	return { followerId };
}

async function run(): Promise<void> {
	const { followerId } = parseArgs();

	logger.info({ followerId }, 'Starting post-fan-out-consumer for follower');

	const partitionIndex = await followerPartitionsService.getPartitionForFollower(followerId);
	if (partitionIndex === null) {
		throw new Error(
			`No partition assignment found for follower ${followerId}. Ensure the follower has been assigned a partition before starting the consumer.`,
		);
	}

	logger.info({ followerId, partitionIndex }, 'Resolved partition assignment for follower');

	const consumer = new KafkaConsumer(
		`post-fan-out-consumer-${followerId}`,
		env.KAFKA_BROKERS,
		'post-fan-out-group',
		partitionIndex,
	);
	await consumer.connect();
	await kafkaProducer.connect();
	await consumer.subscribeAndListen(
		KafkaTopics.PostFanOutV1,
		async ({ message, topic, partition }) => {
			try {
				await withRetry(async () => {
					// TODO: Implement post-fan-out-consumer logic
				});
			} catch (error) {
				const dlqReason = normalizeError(error).message;
				dlqMessagesTotal.inc({ service: env.SERVICE_NAME, original_topic: topic });
				await kafkaProducer.sendToDLQ(message, {
					dlqReason,
					originalTopic: topic,
					originalPartition: partition,
				});
			}
		},
	);

	const disconnectAndExit = async (signal?: string): Promise<void> => {
		try {
			logger.info({ followerId, signal }, 'Shutting down consumer');
			await consumer.disconnect();
			await kafkaProducer.disconnect();
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
