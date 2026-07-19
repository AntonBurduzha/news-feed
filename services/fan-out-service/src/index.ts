import type { Server } from 'node:http';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
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
import {
	onFollowChanged,
	onPostCreated,
	onPostDeleted,
	onUserDeleted,
} from './modules/feed/feed.consumer';

let server: Server | undefined;
let shuttingDown = false;

const fanOutTracer = trace.getTracer('fan-out-projection');

const consumer = new KafkaConsumer(
	'fan-out-service-consumer',
	env.KAFKA_BROKERS,
	'fan-out-feed-group',
);

async function startConsumer(): Promise<void> {
	await consumer.connect();
	await kafkaProducer.connect();

	await consumer.subscribeAndListen(
		[
			KafkaTopics.PostCreatedV1,
			KafkaTopics.PostDeletedV1,
			KafkaTopics.UserDeletedV1,
			KafkaTopics.FollowChangedV1,
		],
		async ({ message, topic, partition }) => {
			try {
				await withRetry(async () => {
					const value = message.value!.toString();
					const parsed = JSON.parse(value) as Record<string, unknown>;
					const spanAttributes: Record<string, string> = { 'kafka.topic': topic };
					if (typeof parsed.postId === 'string') {
						spanAttributes['post.id'] = parsed.postId;
					}
					if (typeof parsed.userId === 'string') {
						spanAttributes['user.id'] = parsed.userId;
					}
					if (typeof parsed.followerId === 'string') {
						spanAttributes['follower.id'] = parsed.followerId;
					}

					const handlerSpan = fanOutTracer.startSpan(`fan-out.${topic}`, {
						attributes: spanAttributes,
					});
					await context.with(trace.setSpan(context.active(), handlerSpan), async () => {
						try {
							switch (topic) {
								case KafkaTopics.PostCreatedV1:
									await onPostCreated(value);
									break;
								case KafkaTopics.PostDeletedV1:
									await onPostDeleted(value);
									break;
								case KafkaTopics.UserDeletedV1:
									await onUserDeleted(value);
									break;
								case KafkaTopics.FollowChangedV1:
									await onFollowChanged(value);
									break;
								default:
									logger.error({ topic }, 'Unknown topic');
							}
						} catch (error) {
							handlerSpan.recordException(error as Error);
							handlerSpan.setStatus({
								code: SpanStatusCode.ERROR,
								message: (error as Error).message,
							});
							throw error;
						} finally {
							handlerSpan.end();
						}
					});
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

const BACKGROUND_SERVICES = [
	{ name: 'Redis', start: connectRedis },
	{ name: 'Kafka consumer', start: startConsumer },
] as const;
const BACKGROUND_SERVICE_RETRY_INTERVAL_MS = 2000;

async function startBackgroundServiceSafely(
	serviceName: string,
	startServiceCb: () => Promise<void>,
): Promise<void> {
	while (!shuttingDown) {
		try {
			await startServiceCb();
			return;
		} catch (error) {
			logger.warn(
				{ err: normalizeError(error), serviceName },
				`${serviceName} unavailable, retrying in ${BACKGROUND_SERVICE_RETRY_INTERVAL_MS}ms`,
			);
			await new Promise(resolve => setTimeout(resolve, BACKGROUND_SERVICE_RETRY_INTERVAL_MS));
		}
	}
}

async function start(): Promise<void> {
	server = app
		.listen(env.PORT, () => {
			logger.info({ serviceName: env.SERVICE_NAME }, `ready on port ${env.PORT}`);
		})
		.on('error', error => {
			process.exitCode = 1;
			void shutdown('server_error', error);
		});
	for (const service of BACKGROUND_SERVICES) {
		void startBackgroundServiceSafely(service.name, service.start);
	}
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
