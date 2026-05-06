import { Kafka, logLevel } from 'kafkajs';
import { env } from './env';

export const kafka = new Kafka({
	clientId: env.KAFKA_NEWS_FEED_SERVICE_CLIENT_ID,
	brokers: env.KAFKA_BROKERS,
	logLevel: logLevel.INFO,
	retry: {
		initialRetryTime: 100,
		retries: 8,
	},
});
