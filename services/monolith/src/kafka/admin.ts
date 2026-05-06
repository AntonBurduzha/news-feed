import type { Admin } from 'kafkajs';
import { kafka } from '@/config/kafka';
import { logger } from '@/lib/logger';
import { KafkaTopics } from './topics';

class KafkaAdmin {
	private readonly admin: Admin;
	public partitionCounts = new Map<string, number>();

	constructor() {
		this.admin = kafka.admin();
	}

	async connect(): Promise<void> {
		await this.admin.connect();
		logger.info('Kafka admin connected');
		const topicsInKafka = await this.admin.listTopics();
		const topicsAvailable = Object.values(KafkaTopics);
		const topicsToCreate = topicsAvailable.filter(topic => !topicsInKafka.includes(topic));
		if (topicsToCreate.length > 0) {
			logger.info({ topicsToCreate }, 'Creating topics');
			await this.createTopics(topicsToCreate);
		}

		const metadata = await this.admin.fetchTopicMetadata({ topics: topicsAvailable });
		metadata.topics.forEach(topic => {
			this.partitionCounts.set(topic.name, topic.partitions.length);
			logger.info(
				{ topic: topic.name, partitions: topic.partitions.length },
				'Current partitions count for topic',
			);
		});
	}

	async disconnect(): Promise<void> {
		await this.admin.disconnect();
		logger.info('Kafka admin disconnected');
	}

	async createTopics(topics: string[]): Promise<void> {
		await this.admin.createTopics({
			topics: topics.map(topic => ({ topic, numPartitions: 1, replicationFactor: 1 })),
		});
	}

	async createPartitions(topic: string, newTotalCount: number): Promise<void> {
		await this.admin.createPartitions({
			topicPartitions: [{ topic, count: newTotalCount }],
		});
		logger.info(
			{ topic, previousCount: this.partitionCounts.get(topic) ?? 0, newTotalCount },
			'Created new Kafka partition on topic',
		);
		this.partitionCounts.set(topic, newTotalCount);
	}

	getPartitionCount(topic: string): number {
		return this.partitionCounts.get(topic) ?? 0;
	}

	setPartitionCount(topic: string, count: number): void {
		this.partitionCounts.set(topic, count);
	}
}

export const kafkaAdmin = new KafkaAdmin();
