import http from 'node:http';
import promClient from 'prom-client';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { KafkaTopics } from '@news-feed/contracts';
import { env } from '@/config/env';
import { createBackgroundSupervisor, startSupervisorMetrics } from '@/lib/background-supervisor';
import { logger } from '@/lib/logger';
import { dlqMessagesRedrivenTotal } from '@/lib/metrics';
import { normalizeError } from '@/lib/errors';
import KafkaConsumer from '@/kafka/consumer';
import { kafkaProducer } from '@/kafka/producer';

const log = logger.child({ service: env.DLQ_REDRIVE_SERVICE_NAME });
const tracer = trace.getTracer('dlq-redrive');
const consumer = new KafkaConsumer('dlq-redrive', env.KAFKA_BROKERS, 'dlq-redrive-group');

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

async function startRedriveConsumer(): Promise<void> {
	await consumer.connect();
	await kafkaProducer.connect();

	await consumer.subscribeAndListen(KafkaTopics.AppDLQ, async ({ message }) => {
		const redriveSpan = tracer.startSpan('dlq-redrive.redrive');

		// INFO: context.with() makes redriveSpan "active" for downstream auto-instrumentation (kafka)
		await context.with(trace.setSpan(context.active(), redriveSpan), async () => {
			try {
				const originalTopic = message.headers?.['x-original-topic']?.toString();
				if (!originalTopic) {
					redriveSpan.setStatus({
						code: SpanStatusCode.ERROR,
						message: 'DLQ message missing x-original-topic',
					});
					log.error(
						{ key: message.key?.toString() },
						'DLQ message missing x-original-topic, skipping',
					);
					return;
				}

				redriveSpan.setAttribute('kafka.original_topic', originalTopic);

				await kafkaProducer.sendMessage(originalTopic, [
					{
						key: message.key!.toString(),
						value: message.value!.toString(),
						headers: { 'x-redriven-at': new Date().toISOString() },
					},
				]);

				dlqMessagesRedrivenTotal.inc({
					service: env.DLQ_REDRIVE_SERVICE_NAME,
					original_topic: originalTopic,
				});
				log.info(
					{ topic: originalTopic, redriven: true, key: message.key?.toString() },
					'Kafka publish message',
				);
			} catch (error) {
				redriveSpan.recordException(error as Error);
				redriveSpan.setStatus({
					code: SpanStatusCode.ERROR,
					message: (error as Error).message,
				});
				log.error(
					{ err: normalizeError(error), key: message.key?.toString() },
					'Failed to redrive DLQ message',
				);
				throw error;
			} finally {
				redriveSpan.end();
			}
		});
	});
}

async function cleanupKafka(): Promise<void> {
	const errors: unknown[] = [];
	try {
		await consumer.disconnect();
	} catch (error) {
		errors.push(error);
	}
	try {
		await kafkaProducer.disconnect();
	} catch (error) {
		errors.push(error);
	}
	if (errors.length > 0) {
		throw new AggregateError(errors, 'Kafka cleanup failed');
	}
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
	const metricsServer = startMetricsServer(env.DLQ_REDRIVE_PORT);
	log.info('Starting DLQ redrive worker');

	backgroundSupervisor.start({
		name: 'Kafka DLQ consumer',
		run: startRedriveConsumer,
		check: () => consumer.isHealthy(),
		onUnhealthy: 'restart',
		cleanup: cleanupKafka,
	});

	startSupervisorMetrics(backgroundSupervisor, env.DLQ_REDRIVE_SERVICE_NAME);

	const shutdown = async (signal?: NodeJS.Signals, error?: unknown): Promise<void> => {
		if (backgroundSupervisor.isShuttingDown()) {
			return;
		}
		if (error) {
			process.exitCode = 1;
			log.error({ err: normalizeError(error) }, 'Shutting down DLQ redrive worker after error');
		} else {
			log.info({ signal }, 'Shutting down DLQ redrive worker');
		}

		await backgroundSupervisor.stop();
		await closeMetricsServer(metricsServer).catch(closeError => {
			process.exitCode = 1;
			log.error({ err: normalizeError(closeError) }, 'Failed to close metrics server');
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

void run().catch(error => {
	log.error({ err: normalizeError(error) }, 'DLQ redrive worker failed to start');
	process.exitCode = 1;
});
