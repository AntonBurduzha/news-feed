import type { Server } from 'node:http';
import app, { authClient } from '@/app';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import KafkaConsumer from '@/kafka/consumer';
import { kafkaProducer } from '@/kafka/producer';
import { KafkaTopics } from '@news-feed/contracts';
import { withRetry } from '@/lib/retry';
import { dlqMessagesTotal } from '@/lib/metrics';
import { connectRedis, disconnectRedis } from './db/redis';
import { onPostCreated, onPostDeleted, onUserDeleted } from './modules/feed/feed.consumer';

let server: Server | undefined;
let shuttingDown = false;

const consumer = new KafkaConsumer(
	'fan-out-service-consumer',
	env.KAFKA_BROKERS,
	'fan-out-feed-group',
);

async function startConsumer(): Promise<void> {
	await consumer.connect();
	await kafkaProducer.connect();

	await consumer.subscribeAndListen(
		[KafkaTopics.PostCreatedV1, KafkaTopics.PostDeletedV1, KafkaTopics.UserDeletedV1],
		async ({ message, topic, partition }) => {
			try {
				await withRetry(async () => {
					const value = message.value!.toString();
					switch (topic) {
						case KafkaTopics.PostCreatedV1:
							return onPostCreated(value);
						case KafkaTopics.PostDeletedV1:
							return onPostDeleted(value);
						case KafkaTopics.UserDeletedV1:
							return onUserDeleted(value);
						default:
							logger.error({ topic }, 'Unknown topic');
							return;
					}
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
}

async function start(): Promise<void> {
	await connectRedis();
	await startConsumer();
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

	const disposables: Array<[string, () => Promise<unknown>]> = [
		['Auth client', () => authClient.disconnect()],
		['Kafka consumer', () => consumer.disconnect()],
		['Kafka producer', () => kafkaProducer.disconnect()],
		['Redis', () => disconnectRedis()],
	];
	for (const [label, close] of disposables) {
		await close().catch(err =>
			logger.error({ err: normalizeError(err) }, `Failed to disconnect ${label}`),
		);
	}
}

process.on('uncaughtException', e => {
	process.exitCode = 1;
	void shutdown('uncaught_exception', e);
});
process.on('unhandledRejection', e => {
	process.exitCode = 1;
	void shutdown('unhandled_rejection', e);
});
process.on('SIGINT', () => {
	process.exitCode = 0;
	void shutdown('sigint');
});
process.on('SIGTERM', () => {
	process.exitCode = 0;
	void shutdown('sigterm');
});

void start().catch(async e => {
	process.exitCode = 1;
	await shutdown('startup_failed', e);
});
