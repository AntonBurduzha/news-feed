import { kafkaProducer } from '@/kafka/producer';
import { logger } from '@/lib/logger';
import { normalizeError } from '@/lib/errors';
import { messagesOutboxService } from '@/modules/messages-outbox/messages-outbox.service';
import { MessageOutboxStatus } from '@/modules/messages-outbox/messages-outbox.types';

let outboxRelayInterval: NodeJS.Timeout | null = null;

async function run(): Promise<void> {
	logger.info('Starting outbox relay worker');
	await kafkaProducer.connect();

	outboxRelayInterval = setInterval(() => {
		void (async () => {
			try {
				const pendingMessages = await messagesOutboxService.findPendingMessages();
				if (pendingMessages.length === 0) {
					return;
				}
				logger.info({ pendingMessages }, 'Found pending messages in outbox relay worker');
				for (const message of pendingMessages) {
					await kafkaProducer.sendMessage(message.topic, [
						{
							key: message.payload.key as string,
							value: message.payload.value as string,
							...(message.payload.partition
								? { partition: message.payload.partition as number }
								: {}),
						},
					]);
				}
				await messagesOutboxService.updateMessageStatus(
					pendingMessages.map(m => m.id),
					'sent' as MessageOutboxStatus,
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
