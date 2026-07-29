import http from 'node:http';
import promClient from 'prom-client';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { env } from '@/config/env';
import { checkPostgresConnection, db, startPgPoolMetrics } from '@/db/postgres';
import { kafkaProducer } from '@/kafka/producer';
import { createBackgroundSupervisor, startSupervisorMetrics } from '@/lib/background-supervisor';
import { logger } from '@/lib/logger';
import {
	outboxPendingMessages,
	outboxRelayDurationSeconds,
	kafkaMessagesProducedTotal,
	outboxPublishFailuresTotal,
} from '@/lib/metrics';
import { normalizeError } from '@/lib/errors';
import { messagesOutboxService } from '@/modules/messages-outbox/messages-outbox.service';
import { runOutboxRelayBatch } from './outbox-relay.batch';

const log = logger.child({ service: env.OUTBOX_RELAY_SERVICE_NAME });
let outboxRelayInterval: NodeJS.Timeout | null = null;
let inFlightBatch: Promise<void> | null = null;
const tracer = trace.getTracer('outbox-relay');

const backgroundSupervisor = createBackgroundSupervisor(log);

function startMetricsServer(port: number): http.Server {
	const server = http.createServer((req, res) => {
		if (req.url !== '/metrics') {
			res.statusCode = 404;
			res.end();
			return;
		}
		void promClient.register.metrics().then(body => {
			res.setHeader('Content-Type', promClient.register.contentType);
			res.end(body);
		});
	});
	server.listen(port, () => {
		log.info({ port }, 'Metrics server listening');
	});
	return server;
}

async function runBatchWithTracing(): Promise<void> {
	const batchSpan = tracer.startSpan('outbox-relay.batch');

	// INFO: context.with() makes batchSpan "active" for downstream auto-instrumentation (pg, kafka)
	await context.with(trace.setSpan(context.active(), batchSpan), async () => {
		const batchStartedAt = Date.now();
		try {
			const result = await runOutboxRelayBatch({
				outboxService: messagesOutboxService,
				producer: kafkaProducer,
				onPublishSuccess: (topic: string, count: number) => {
					kafkaMessagesProducedTotal.inc(
						{
							topic,
							service: env.OUTBOX_RELAY_SERVICE_NAME,
						},
						count,
					);
				},
				onPublishFailure: (topic, error) => {
					outboxPublishFailuresTotal.inc({
						service: env.OUTBOX_RELAY_SERVICE_NAME,
						topic,
					});
					log.error({ err: normalizeError(error), topic }, 'Failed to publish message to Kafka');
				},
			});

			batchSpan.setAttribute('batch.size', result.pendingCount);
			batchSpan.setAttribute('batch.published', result.publishedCount);
			outboxPendingMessages.set({ service: env.OUTBOX_RELAY_SERVICE_NAME }, result.pendingCount);

			if (result.pendingCount > 0) {
				log.debug(
					{
						pendingCount: result.pendingCount,
						publishedCount: result.publishedCount,
					},
					'Outbox batch published',
				);
				outboxRelayDurationSeconds.observe(
					{ service: env.OUTBOX_RELAY_SERVICE_NAME },
					(Date.now() - batchStartedAt) / 1000,
				);
			}
		} catch (error) {
			batchSpan.recordException(error as Error);
			batchSpan.setStatus({
				code: SpanStatusCode.ERROR,
				message: (error as Error).message,
			});
			log.error({ err: normalizeError(error) }, 'Outbox relay batch failed');
		} finally {
			batchSpan.end();
		}
	});
}

async function startRelayLoop(): Promise<void> {
	await kafkaProducer.connect();

	if (outboxRelayInterval) {
		return;
	}

	outboxRelayInterval = setInterval(() => {
		if (inFlightBatch) {
			return;
		}
		const batch = runBatchWithTracing();
		inFlightBatch = batch;
		void batch.finally(() => {
			if (inFlightBatch === batch) {
				inFlightBatch = null;
			}
		});
	}, 5_000);
}

async function stopRelayLoop(): Promise<void> {
	if (outboxRelayInterval) {
		clearInterval(outboxRelayInterval);
		outboxRelayInterval = null;
	}
	await inFlightBatch;
	inFlightBatch = null;
	await kafkaProducer.disconnect();
}

async function closeMetricsServer(server: http.Server): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.close(error => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}

async function run(): Promise<void> {
	await checkPostgresConnection();
	startPgPoolMetrics();

	const metricsServer = startMetricsServer(env.OUTBOX_RELAY_PORT);
	log.info('Starting outbox worker');

	backgroundSupervisor.start({
		name: 'Kafka producer and outbox',
		run: startRelayLoop,
		cleanup: stopRelayLoop,
	});

	startSupervisorMetrics(backgroundSupervisor, env.OUTBOX_RELAY_SERVICE_NAME);

	const shutdown = async (signal?: NodeJS.Signals, error?: unknown): Promise<void> => {
		if (backgroundSupervisor.isShuttingDown()) {
			return;
		}
		if (error) {
			process.exitCode = 1;
			log.error({ err: normalizeError(error) }, 'Shutting down outbox worker after error');
		} else {
			log.info({ signal }, 'Shutting down outbox worker');
		}

		await backgroundSupervisor.stop();
		await closeMetricsServer(metricsServer).catch(closeError => {
			process.exitCode = 1;
			log.error({ err: normalizeError(closeError) }, 'Failed to close metrics server');
		});
		await db.end().catch(closeError => {
			process.exitCode = 1;
			log.error({ err: normalizeError(closeError) }, 'Failed to close Postgres pool');
		});

		if (signal) {
			process.kill(process.pid, signal);
		}
	};

	process.on('unhandledRejection', error => {
		void shutdown(undefined, error);
	});

	process.on('uncaughtException', error => {
		void shutdown(undefined, error);
	});

	const signalTraps: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
	for (const signal of signalTraps) {
		process.once(signal, () => {
			void shutdown(signal);
		});
	}
}

void run().catch(async error => {
	log.error({ err: normalizeError(error) }, 'Outbox worker failed to start');
	process.exitCode = 1;
	await db.end().catch(closeError => {
		log.error({ err: normalizeError(closeError) }, 'Failed to close Postgres pool');
	});
});
