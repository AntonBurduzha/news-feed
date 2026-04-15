import { Kafka, logLevel, type Consumer, type EachMessagePayload } from 'kafkajs';
import { logger } from '@/lib/logger';
import { createFollowerPartitionAssigner } from '@/kafka/partition-assigner';
import { formatKafkaTimestamp } from '@/utils/date';

class KafkaConsumer {
	private readonly kafka: Kafka;
	private readonly consumer: Consumer;
	private readonly groupId: string;

	constructor(clientId: string, brokers: string[], groupId: string, partitionIndex: number) {
		this.kafka = new Kafka({
			clientId,
			brokers,
			logLevel: logLevel.INFO,
		});
		this.groupId = groupId;
		this.consumer = this.kafka.consumer({
			groupId,
			...(partitionIndex !== null
				? { partitionAssigners: [createFollowerPartitionAssigner(partitionIndex)] }
				: {}),
		});
	}

	async connect(): Promise<void> {
		await this.consumer.connect();
		logger.info({ groupId: this.groupId }, 'Kafka consumer connected');
	}

	async disconnect(): Promise<void> {
		await this.consumer.disconnect();
		logger.info({ groupId: this.groupId }, 'Kafka consumer disconnected');
	}

	async subscribeAndListen(topic: string): Promise<void> {
		await this.consumer.subscribe({ topic, fromBeginning: false });

		logger.info({ topic, groupId: this.groupId }, 'Consumer subscribed to topic');

		await this.consumer.run({
			eachMessage: async (payload: EachMessagePayload) => {
				const { topic, partition, message } = payload;

				logger.info(
					{
						topic,
						partition,
						offset: message.offset,
						timestamp: formatKafkaTimestamp(message.timestamp),
						key: message.key?.toString(),
						value: message.value?.toString(),
						groupId: this.groupId,
					},
					'Consumed Kafka message',
				);
			},
		});
	}
}

export default KafkaConsumer;
