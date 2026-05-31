import client from 'prom-client';

client.collectDefaultMetrics({ prefix: 'nodejs_' });

// Dev metrics
export const httpRequestsTotal = new client.Counter({
	name: 'http_requests_total',
	help: 'Total HTTP requests',
	labelNames: ['method', 'route', 'status_code', 'service'] as const,
});

export const httpRequestDuration = new client.Histogram({
	name: 'http_request_duration_seconds',
	help: 'HTTP request duration in seconds',
	labelNames: ['method', 'route', 'status_code', 'service'] as const,
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export const httpRequestErrorsTotal = new client.Counter({
	name: 'http_request_errors_total',
	help: 'Total HTTP 5xx responses',
	labelNames: ['method', 'route', 'service'] as const,
});

// Business metrics
export const commentsCreatedTotal = new client.Counter({
	name: 'comments_created_total',
	help: 'Comments created',
	labelNames: ['service'] as const,
});

export const commentsDeletedTotal = new client.Counter({
	name: 'comments_deleted_total',
	help: 'Comments deleted',
	labelNames: ['service'] as const,
});

export const dlqMessagesTotal = new client.Counter({
	name: 'dlq_messages_total',
	help: 'Messages sent to the dead-letter queue',
	labelNames: ['service', 'original_topic'] as const,
});

// MongoDB metrics
export const mongoPoolConnections = new client.Gauge({
	name: 'mongo_pool_connections',
	help: 'MongoDB connection pool state',
	labelNames: ['state', 'service'] as const,
});

// Kafka metrics
export const kafkaMessagesConsumedTotal = new client.Counter({
	name: 'kafka_messages_consumed_total',
	help: 'Total Kafka messages consumed',
	labelNames: ['topic', 'consumer_group', 'service'] as const,
});

export const kafkaConsumerProcessingDuration = new client.Histogram({
	name: 'kafka_consumer_processing_duration_seconds',
	help: 'Time to process one Kafka message',
	labelNames: ['topic', 'consumer_group', 'service'] as const,
	buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 30],
});

export const kafkaConsumerLag = new client.Gauge({
	name: 'kafka_consumer_lag',
	help: 'Consumer group lag per topic partition',
	labelNames: ['topic', 'consumer_group', 'partition', 'service'] as const,
});
