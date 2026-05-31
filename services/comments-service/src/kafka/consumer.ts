import { Kafka, logLevel, type Consumer, type EachMessagePayload } from 'kafkajs';
import { env } from '@/config/env';
import {
	kafkaMessagesConsumedTotal,
	kafkaConsumerProcessingDuration,
	kafkaConsumerLag,
} from '@/lib/metrics';
import { logger } from '@/lib/logger';
import { formatKafkaTimestamp } from '@/utils/date';
import { normalizeError } from '@/lib/errors';

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
				const endTimer = kafkaConsumerProcessingDuration.startTimer({
					topic,
					consumer_group: this.groupId,
					service: env.SERVICE_NAME,
				});
				logger.info(
					{
						topic,
						...(correlationId ? { correlationId } : {}),
						partition,
						offset: message.offset,
						timestamp: formatKafkaTimestamp(message.timestamp),
						key: message.key?.toString(),
						value: message.value?.toString(),
						groupId: this.groupId,
					},
					'Consumed Kafka message',
				);
				try {
					await topicCallback(payload);
					kafkaMessagesConsumedTotal.inc({
						topic,
						consumer_group: this.groupId,
						service: env.SERVICE_NAME,
					});
				} finally {
					endTimer();
				}
			},
		});
		setInterval(
			() =>
				void this.pollConsumerLag(this.kafka, this.groupId, topics).catch(error => {
					logger.error({ err: normalizeError(error) }, 'Failed to poll consumer lag');
				}),
			30_000,
		).unref();
	}

	async pollConsumerLag(kafka: Kafka, groupId: string, topics: string[]): Promise<void> {
		const admin = kafka.admin();
		await admin.connect();
		try {
			const offsets = await admin.fetchOffsets({ groupId, topics });
			for (const { topic, partitions } of offsets) {
				const highWaterMarks = await admin.fetchTopicOffsets(topic);
				for (const { partition, offset } of partitions) {
					const high = Number(highWaterMarks.find(p => p.partition === partition)?.offset ?? '0');
					const lag = Math.max(0, high - Number(offset));
					kafkaConsumerLag.set(
						{
							topic,
							consumer_group: groupId,
							partition: String(partition),
							service: env.SERVICE_NAME,
						},
						lag,
					);
				}
			}
		} finally {
			await admin.disconnect();
		}
	}
}

export default KafkaConsumer;
