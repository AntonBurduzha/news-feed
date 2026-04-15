import { CompressionTypes, type Producer } from 'kafkajs';
import { kafka } from '@/config/kafka';
import { logger } from '@/lib/logger';

type KafkaMessage = {
	key: string;
	value: string;
	partition?: number;
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
			'Kafka messages sent',
		);
	}
}

export const kafkaProducer = new KafkaProducer();
