import http from 'node:http';
import promClient from 'prom-client';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { env } from '@/config/env';
import { kafkaProducer } from '@/kafka/producer';
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
const tracer = trace.getTracer('outbox-relay');

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

const OUTBOX_RELAY_PORT = Number(process.env.OUTBOX_RELAY_PORT ?? 3010);

async function run(): Promise<void> {
	const metricsServer = startMetricsServer(OUTBOX_RELAY_PORT);
	log.info('Starting outbox relay worker');
	await kafkaProducer.connect();

	outboxRelayInterval = setInterval(() => {
		void (async () => {
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
							log.error(
								{ err: normalizeError(error), topic },
								'Failed to publish message to Kafka',
							);
						},
					});

					batchSpan.setAttribute('batch.size', result.pendingCount);
					batchSpan.setAttribute('batch.published', result.publishedCount);
					outboxPendingMessages.set(
						{ service: env.OUTBOX_RELAY_SERVICE_NAME },
						result.pendingCount,
					);

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
		})();
	}, 5000);

	const disconnectAndExit = async (signal?: string): Promise<void> => {
		try {
			log.info('Shutting down outbox relay worker');
			await kafkaProducer.disconnect();
			metricsServer.close();
		} catch (error) {
			log.error({ err: normalizeError(error) }, 'Failed to disconnect Kafka producer');
			process.exitCode = 1;
		}

		if (signal) {
			process.kill(process.pid, signal);
		}
	};

	process.on('unhandledRejection', error => {
		log.error({ err: normalizeError(error) }, 'Unhandled rejection in outbox relay worker');
		void disconnectAndExit();
	});

	process.on('uncaughtException', error => {
		log.error({ err: normalizeError(error) }, 'Uncaught exception in outbox relay worker');
		void disconnectAndExit();
	});

	const signalTraps: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
	for (const signal of signalTraps) {
		process.once(signal, () => {
			void disconnectAndExit(signal);
		});
	}
}

void run().catch(error => {
	log.error({ err: normalizeError(error) }, 'Outbox relay worker failed to start');
	if (outboxRelayInterval) {
		clearInterval(outboxRelayInterval);
	}
	process.exitCode = 1;
});
