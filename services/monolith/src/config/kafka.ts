import { Kafka, logLevel } from 'kafkajs';
import { env } from './env';
import { logger } from '@/lib/logger';
import { createKafkaLogCreator } from '@/lib/kafka-logger';

export const kafka = new Kafka({
	clientId: env.KAFKA_NEWS_FEED_SERVICE_CLIENT_ID,
	brokers: env.KAFKA_BROKERS,
	logLevel: logLevel.WARN,
	logCreator: createKafkaLogCreator(logger),
	retry: {
		initialRetryTime: 100,
		retries: 8,
	},
});
