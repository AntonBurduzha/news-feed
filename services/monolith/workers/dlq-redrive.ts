import http from 'node:http';
import promClient from 'prom-client';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { env } from '@/config/env';
import { logger } from '@/lib/logger';
import { dlqMessagesRedrivenTotal } from '@/lib/metrics';
import { normalizeError } from '@/lib/errors';
import { KafkaTopics } from '@/kafka/topics';
import KafkaConsumer from '@/kafka/consumer';
import { kafkaProducer } from '@/kafka/producer';

const log = logger.child({ service: env.DLQ_REDRIVE_SERVICE_NAME });
const tracer = trace.getTracer('dlq-redrive');

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

const DLQ_REDRIVE_PORT = Number(process.env.DLQ_REDRIVE_PORT ?? 3011);

async function run(): Promise<void> {
	const metricsServer = startMetricsServer(DLQ_REDRIVE_PORT);
	log.info('Starting DLQ redrive worker');

	const consumer = new KafkaConsumer('dlq-redrive', env.KAFKA_BROKERS, 'dlq-redrive-group');
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

	const disconnectAndExit = async (signal?: string): Promise<void> => {
		try {
			log.info({ signal }, 'Shutting down DLQ redrive worker');
			await consumer.disconnect();
			await kafkaProducer.disconnect();
			metricsServer.close();
		} catch (error) {
			log.error({ err: normalizeError(error) }, 'Failed to disconnect Kafka consumer');
			process.exitCode = 1;
		}

		if (signal) {
			process.kill(process.pid, signal);
		}
	};

	process.on('unhandledRejection', error => {
		log.error({ err: normalizeError(error) }, 'Unhandled rejection in DLQ redrive worker');
		void disconnectAndExit();
	});

	process.on('uncaughtException', error => {
		log.error({ err: normalizeError(error) }, 'Uncaught exception in DLQ redrive worker');
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
	log.error({ err: normalizeError(error) }, 'DLQ redrive worker failed to start');
	process.exitCode = 1;
});
