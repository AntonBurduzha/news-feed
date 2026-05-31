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
import { MessageOutboxStatus } from '@/modules/messages-outbox/messages-outbox.constants';

let outboxRelayInterval: NodeJS.Timeout | null = null;

async function run(): Promise<void> {
	logger.info('Starting outbox relay worker');
	await kafkaProducer.connect();

	outboxRelayInterval = setInterval(() => {
		void (async () => {
			const batchStartedAt = Date.now();
			try {
				const pendingMessages = await messagesOutboxService.findPendingMessages();
				outboxPendingMessages.set({ service: env.SERVICE_NAME }, pendingMessages.length);
				if (pendingMessages.length === 0) {
					return;
				}
				logger.info(
					{ pendingCount: pendingMessages.length },
					'Found pending messages in outbox relay worker',
				);
				let publishedCount = 0;
				for (const message of pendingMessages) {
					try {
						await kafkaProducer.sendMessage(message.topic, [
							{
								key: message.payload.key as string,
								value: message.payload.value as string,
								headers: {
									'x-correlation-id': message.correlationId,
								},
								...(message.payload.partition
									? { partition: message.payload.partition as number }
									: {}),
							},
						]);
					} catch (error) {
						outboxPublishFailuresTotal.inc({ service: env.SERVICE_NAME, topic: message.topic });
						logger.error(
							{ err: normalizeError(error), topic: message.topic },
							'Failed to publish message to Kafka',
						);
					}
					kafkaMessagesProducedTotal.inc({ topic: message.topic, service: env.SERVICE_NAME });
					publishedCount += 1;
				}
				logger.info({ publishedCount }, 'Published messages in outbox relay worker');
				await messagesOutboxService.updateMessageStatus(
					pendingMessages.map(m => m.id),
					MessageOutboxStatus.Sent,
				);
				outboxRelayDurationSeconds.observe(
					{ service: env.SERVICE_NAME },
					(Date.now() - batchStartedAt) / 1000,
				);
			} catch (error) {
				logger.error(
					{ err: normalizeError(error) },
					'Failed to find pending messages in outbox relay worker',
				);
			}
		})();
	}, 5000);

	const disconnectAndExit = async (signal?: string): Promise<void> => {
		try {
			logger.info('Shutting down outbox relay worker');
			await kafkaProducer.disconnect();
		} catch (error) {
			logger.error(
				{ err: normalizeError(error) },
				'Failed to disconnect Kafka producer during shutdown outbox relay worker',
			);
			process.exitCode = 1;
		}

		if (signal) {
			process.kill(process.pid, signal);
		}
	};

	process.on('unhandledRejection', error => {
		logger.error({ err: normalizeError(error) }, 'Unhandled rejection in outbox relay worker');
		void disconnectAndExit();
	});

	process.on('uncaughtException', error => {
		logger.error({ err: normalizeError(error) }, 'Uncaught exception in outbox relay worker');
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
	logger.error({ err: normalizeError(error) }, 'Outbox relay worker failed to start');
	if (outboxRelayInterval) {
		clearInterval(outboxRelayInterval);
	}
	process.exitCode = 1;
});
