import type { Server } from 'node:http';
import app, { authClient } from '@/app';
import { env } from '@/config/env';
import { connectMongo, disconnectMongo, startMongoPoolMetrics } from '@/db/mongo';
import KafkaConsumer from '@/kafka/consumer';
import { kafkaProducer } from '@/kafka/producer';
import { KafkaTopics } from '@/kafka/topics';
import { dlqMessagesTotal } from '@/lib/metrics';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import { withRetry } from '@/lib/retry';
import { commentsService } from '@/modules/comments/comments.service';
import { postsProjectionService } from '@/modules/posts-projection/posts-projection.service';

let server: Server | undefined;
let shuttingDown = false;
const consumer = new KafkaConsumer(
	'comments-svc-consumer',
	env.KAFKA_BROKERS,
	'comments-svc-posts-projection',
);

async function start(): Promise<void> {
	await connectMongo();
	startMongoPoolMetrics();
	await consumer.connect();
	await kafkaProducer.connect();

	await consumer.subscribeAndListen(
		[KafkaTopics.PostDeletedV1, KafkaTopics.PostCreatedV1],
		async ({ message, topic, partition }) => {
			try {
				await withRetry(async () => {
					const { postId, userId } = JSON.parse(message.value!.toString()) as {
						postId: string;
						userId: string;
					};
					switch (topic) {
						case KafkaTopics.PostDeletedV1:
							await postsProjectionService.upsertById({ _id: postId, deletedAt: new Date() });
							logger.info(
								{ topic, postId, event: KafkaTopics.PostDeletedV1 },
								'Kafka consumed message',
							);
							// eslint-disable-next-line no-case-declarations
							const deletedCount = await commentsService.deleteCommentsByPostId(postId);
							logger.info(
								{ postId, deletedCommentCount: deletedCount, event: KafkaTopics.PostDeletedV1 },
								'Projection deleted and comments purged',
							);
							break;
						case KafkaTopics.PostCreatedV1:
							await postsProjectionService.upsertById({ _id: postId, userId });
							logger.info(
								{ postId, userId, event: KafkaTopics.PostCreatedV1 },
								'Projection upserted',
							);
							break;
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
		['Kafka producer', () => kafkaProducer.disconnect()],
		['Kafka consumer', () => consumer.disconnect()],
		['MongoDB connection', () => disconnectMongo()],
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
