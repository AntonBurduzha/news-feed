import {
	logLevel,
	type Admin,
	type ConnectEvent,
	type Consumer,
	type DisconnectEvent,
	type logCreator as LogCreator,
	type Producer,
} from 'kafkajs';
import type { RuntimeLogger } from './background-supervisor.js';

type AttachConnectionLoggingOptions =
	| { client: Consumer; logger: RuntimeLogger; clientType: 'consumer'; groupId: string }
	| { client: Producer; logger: RuntimeLogger; clientType: 'producer' }
	| { client: Admin; logger: RuntimeLogger; clientType: 'admin' };

export function createKafkaLogCreator(logger: RuntimeLogger): LogCreator {
	let lastMessage: string | undefined;
	let repeats = 0;

	return () =>
		({ level, log }) => {
			const { message, ...extra } = log;
			delete extra.stack;
			const payload = { namespace: 'kafkajs', ...extra };

			if (extra.retryCount !== undefined) {
				logger.debug?.(payload, message);
				return;
			}
			if (message === lastMessage) {
				repeats += 1;
				logger.debug?.({ ...payload, repeat: repeats }, message);
				return;
			}
			lastMessage = message;
			repeats = 0;

			switch (level) {
				case logLevel.ERROR:
					logger.error(payload, message);
					break;
				case logLevel.WARN:
					logger.warn(payload, message);
					break;
				case logLevel.INFO:
					logger.info(payload, message);
					break;
				case logLevel.DEBUG:
				case logLevel.NOTHING:
					logger.debug?.(payload, message);
					break;
			}
		};
}

export function attachConnectionLogging(options: AttachConnectionLoggingOptions): void {
	const { logger, clientType } = options;
	const context = options.clientType === 'consumer' ? { groupId: options.groupId } : {};
	let connected = false;
	let wasDisconnected = false;

	const onConnect = (event: ConnectEvent) => {
		if (connected) {
			return;
		}
		connected = true;

		const payload = { ...context, ...event };
		if (wasDisconnected) {
			logger.info(payload, `Kafka ${clientType} reconnected`);
			return;
		}
		if (clientType === 'consumer') {
			logger.debug?.(payload, 'Kafka consumer connected');
			return;
		}
		logger.info(payload, `Kafka ${clientType} connected`);
	};

	const onDisconnect = (event: DisconnectEvent) => {
		connected = false;
		wasDisconnected = true;
		logger.warn({ ...context, ...event }, `Kafka ${clientType} disconnected`);
	};

	switch (options.clientType) {
		case 'consumer': {
			const { CONNECT, DISCONNECT, CRASH } = options.client.events;
			options.client.on(CONNECT, onConnect);
			options.client.on(DISCONNECT, onDisconnect);
			options.client.on(CRASH, ({ payload }) => {
				const details = {
					...context,
					restart: payload.restart,
					error: payload.error?.message,
				};
				// INFO: True -> kafkajs will retry, False -> supervisor will restart the consumer
				if (payload.restart) {
					logger.warn(details, 'Kafka consumer crashed, kafkajs will retry');
					return;
				}
				logger.error(details, 'Kafka consumer crashed');
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
