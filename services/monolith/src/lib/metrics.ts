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
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10], // secsonds
});

export const httpRequestErrorsTotal = new client.Counter({
	name: 'http_request_errors_total',
	help: 'Total HTTP 5xx responses',
	labelNames: ['method', 'route', 'service'] as const,
});

// Business metrics
export const postsCreatedTotal = new client.Counter({
	name: 'posts_created_total',
	help: 'Posts created',
	labelNames: ['service'] as const,
});

export const postsDeletedTotal = new client.Counter({
	name: 'posts_deleted_total',
	help: 'Posts deleted',
	labelNames: ['service'] as const,
});

export const followsCreatedTotal = new client.Counter({
	name: 'follows_created_total',
	help: 'Follows created',
	labelNames: ['service'] as const,
});

export const followsDeletedTotal = new client.Counter({
	name: 'follows_deleted_total',
	help: 'Follows deleted',
	labelNames: ['service'] as const,
});

// Outbox metrics
export const outboxPendingMessages = new client.Gauge({
	name: 'outbox_pending_messages',
	help: 'Pending outbox messages awaiting relay',
	labelNames: ['service'] as const,
});

export const outboxRelayDurationSeconds = new client.Histogram({
	name: 'outbox_relay_duration_seconds',
	help: 'Duration of one outbox relay cycle',
	labelNames: ['service'] as const,
	buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
});

export const outboxPublishFailuresTotal = new client.Counter({
	name: 'outbox_publish_failures_total',
	help: 'Failed outbox messages Kafka publication',
	labelNames: ['service', 'topic'] as const,
});

export const dlqMessagesTotal = new client.Counter({
	name: 'dlq_messages_total',
	help: 'Messages sent to the dead-letter queue',
	labelNames: ['service', 'original_topic'] as const,
});

// Postgres metrics
export const pgPoolConnections = new client.Gauge({
	name: 'pg_pool_connections',
	help: 'Postgres connection pool state',
	labelNames: ['state', 'service'] as const,
});

// Kafka metrics
export const kafkaMessagesProducedTotal = new client.Counter({
	name: 'kafka_messages_produced_total',
	help: 'Total Kafka messages produced',
	labelNames: ['topic', 'service'] as const,
});

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
