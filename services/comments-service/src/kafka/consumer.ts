import { Kafka, logLevel, type Consumer, type EachMessagePayload } from 'kafkajs';
import { env } from '@/config/env';
import { kafkaMessagesConsumedTotal, kafkaConsumerProcessingDuration } from '@/lib/metrics';
import { logger } from '@/lib/logger';

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
	}
}

export default KafkaConsumer;
