import client from 'prom-client';

client.collectDefaultMetrics({ prefix: 'nodejs_' });

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
export const dlqMessagesTotal = new client.Counter({
	name: 'dlq_messages_total',
	help: 'Messages sent to the dead-letter queue',
	labelNames: ['service', 'original_topic'] as const,
});

export const feedRequestsTotal = new client.Counter({
	name: 'feed_requests_total',
	help: 'Feed requests served',
	labelNames: ['service'] as const,
});

export const feedCacheHitsTotal = new client.Counter({
	name: 'feed_cache_hits_total',
	help: 'Feed served from Redis cache',
	labelNames: ['service'] as const,
});

export const feedCacheMissesTotal = new client.Counter({
	name: 'feed_cache_misses_total',
	help: 'Feed rebuilt from the monolith',
	labelNames: ['service'] as const,
});

export const feedBuildDurationSeconds = new client.Histogram({
	name: 'feed_build_duration_seconds',
	help: 'Time to build a feed from the monolith on a cache miss',
	labelNames: ['service'] as const,
	buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});
