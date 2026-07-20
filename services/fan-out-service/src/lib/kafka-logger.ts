import {
	logLevel,
	type Admin,
	type ConnectEvent,
	type Consumer,
	type DisconnectEvent,
	type logCreator as LogCreator,
	type Producer,
} from 'kafkajs';
import type { Logger } from 'pino';

type AttachConnectionLoggingOptions =
	| { client: Consumer; logger: Logger; clientType: 'consumer'; groupId: string }
	| { client: Producer; logger: Logger; clientType: 'producer' }
	| { client: Admin; logger: Logger; clientType: 'admin' };

export function createKafkaLogCreator(logger: Logger): LogCreator {
	const kafkaLogger = logger.child({ namespace: 'kafkajs' });

	return () =>
		({ level, log }) => {
			const { message, ...extra } = log;

			switch (level) {
				case logLevel.ERROR:
					kafkaLogger.error(extra, message);
					break;
				case logLevel.WARN:
					kafkaLogger.warn(extra, message);
					break;
				case logLevel.INFO:
					kafkaLogger.info(extra, message);
					break;
				case logLevel.DEBUG:
				case logLevel.NOTHING:
					kafkaLogger.debug(extra, message);
					break;
			}
		};
}

export function attachConnectionLogging(options: AttachConnectionLoggingOptions): void {
	const { logger, clientType } = options;
	const context = options.clientType === 'consumer' ? { groupId: options.groupId } : {};
	let wasConnected = false;

	const onConnect = (event: ConnectEvent) => {
		const message = wasConnected
			? `Kafka ${clientType} reconnected`
			: `Kafka ${clientType} connected`;
		wasConnected = true;
		logger.info({ ...context, ...event }, message);
	};

	const onDisconnect = (event: DisconnectEvent) => {
		logger.warn({ ...context, ...event }, `Kafka ${clientType} disconnected`);
	};

	switch (options.clientType) {
		case 'consumer': {
			const { CONNECT, DISCONNECT, CRASH } = options.client.events;

			options.client.on(CONNECT, onConnect);
			options.client.on(DISCONNECT, onDisconnect);
			options.client.on(CRASH, event => {
				logger.error(
					{
						...context,
						...event,
						restart: event.payload.restart,
						error: event.payload.error?.message,
					},
					'Kafka consumer crashed',
				);
			});
			break;
		}
		case 'producer': {
			const { CONNECT, DISCONNECT } = options.client.events;

			options.client.on(CONNECT, onConnect);
			options.client.on(DISCONNECT, onDisconnect);
			break;
		}
		case 'admin': {
			const { CONNECT, DISCONNECT } = options.client.events;

			options.client.on(CONNECT, onConnect);
			options.client.on(DISCONNECT, onDisconnect);
			break;
		}
	}
}
