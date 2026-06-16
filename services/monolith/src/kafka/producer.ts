import {
	CompressionTypes,
	type KafkaMessage as IncomingMessage,
	type Producer,
} from 'kafkajs';
import { kafka } from '@/config/kafka';
import { KafkaTopics } from '@/kafka/topics';
import { logger } from '@/lib/logger';

type KafkaMessage = {
	key: string;
	value: string;
	partition?: number;
	headers?: Record<string, string>;
};

type DLQMetadata = {
	dlqReason: string;
	originalTopic: string;
	originalPartition: number;
};

class KafkaProducer {
	private readonly producer: Producer;

	constructor() {
		this.producer = kafka.producer();
	}

	async connect(): Promise<void> {
		await this.producer.connect();
		logger.info('Kafka producer connected');
	}

	async disconnect(): Promise<void> {
		await this.producer.disconnect();
		logger.info('Kafka producer disconnected');
	}

	async sendMessage(topic: string, messages: KafkaMessage[]): Promise<void> {
		await this.producer.send({
			topic,
			compression: CompressionTypes.GZIP,
			messages,
		});
		logger.info(
			{
				topic,
				messageCount: messages.length,
				partitions: messages.map(m => m.partition).filter(p => p !== undefined),
			},
			'Kafka publish message',
		);
	}

	async sendToDLQ(original: IncomingMessage, meta: DLQMetadata): Promise<void> {
		await this.producer.send({
			topic: KafkaTopics.AppDLQ,
			compression: CompressionTypes.GZIP,
			messages: [
				{
					key: original.key ?? undefined,
					value: original.value,
					headers: {
						...original.headers,
						'x-dlq-reason': meta.dlqReason,
						'x-original-topic': meta.originalTopic,
						'x-original-partition': String(meta.originalPartition),
						'x-failed-at': new Date().toISOString(),
					},
				},
			],
		});

		logger.warn(
			{
				topic: KafkaTopics.AppDLQ,
				dlqReason: meta.dlqReason,
				originalTopic: meta.originalTopic,
				originalPartition: meta.originalPartition,
			},
			'Kafka publish message',
		);
	}
}

export const kafkaProducer = new KafkaProducer();
