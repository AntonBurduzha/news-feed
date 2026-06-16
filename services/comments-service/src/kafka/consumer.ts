import { Kafka, logLevel, type Consumer, type EachMessagePayload } from 'kafkajs';
import { trace, context, propagation, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { env } from '@/config/env';
import { kafkaMessagesConsumedTotal, kafkaConsumerProcessingDuration } from '@/lib/metrics';
import { logger } from '@/lib/logger';

const tracer = trace.getTracer('kafka-consumer');

class KafkaConsumer {
	private readonly kafka: Kafka;
	private readonly consumer: Consumer;
	private readonly groupId: string;

	constructor(clientId: string, brokers: string[], groupId: string) {
		this.kafka = new Kafka({
			clientId,
			brokers,
			logLevel: logLevel.INFO,
		});
		this.groupId = groupId;
		this.consumer = this.kafka.consumer({ groupId });
	}

	async connect(): Promise<void> {
		await this.consumer.connect();
		logger.info({ groupId: this.groupId }, 'Kafka consumer connected');
	}

	async disconnect(): Promise<void> {
		await this.consumer.disconnect();
		logger.info({ groupId: this.groupId }, 'Kafka consumer disconnected');
	}

	async subscribeAndListen(
		topics: string[],
		topicCallback: (payload: EachMessagePayload) => Promise<void>,
	): Promise<void> {
		await this.consumer.subscribe({ topics, fromBeginning: false });

		logger.info({ topics, groupId: this.groupId }, 'Consumer subscribed to topics');

		await this.consumer.run({
			eachMessage: async (payload: EachMessagePayload) => {
				const { topic, partition, message } = payload;
				const correlationId = message.headers?.['x-correlation-id']?.toString();

				const headers: Record<string, string> = {};
				for (const [key, value] of Object.entries(message.headers ?? {})) {
					if (value != null) {
						headers[key] = value.toString();
					}
				}
				const parentCtx = propagation.extract(context.active(), headers);

				const span = tracer.startSpan(
					`kafka.consume ${topic}`,
					{
						kind: SpanKind.CONSUMER,
						attributes: {
							'messaging.system': 'kafka',
							'messaging.destination.name': topic,
							'messaging.kafka.partition': partition,
							'messaging.kafka.offset': message.offset,
							'messaging.consumer.group': this.groupId,
						},
					},
					parentCtx,
				);

				const endTimer = kafkaConsumerProcessingDuration.startTimer({
					topic,
					consumer_group: this.groupId,
					service: env.SERVICE_NAME,
				});

				logger.debug(
					{
						topic,
						...(correlationId ? { correlationId } : {}),
						partition,
						offset: message.offset,
						key: message.key?.toString(),
					},
					'Kafka consumed message',
				);

				await context.with(trace.setSpan(parentCtx, span), async () => {
					try {
						await topicCallback(payload);
						kafkaMessagesConsumedTotal.inc({
							topic,
							consumer_group: this.groupId,
							service: env.SERVICE_NAME,
						});
					} catch (err) {
						span.recordException(err as Error);
						span.setStatus({
							code: SpanStatusCode.ERROR,
							message: (err as Error).message,
						});
						throw err;
					} finally {
						endTimer();
						span.end();
					}
				});
			},
		});
	}
}

export default KafkaConsumer;
