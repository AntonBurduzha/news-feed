import { afterEach, describe, expect, it, vi } from 'vitest';
import { logLevel, type Admin, type Consumer, type Producer } from 'kafkajs';
import { attachConnectionLogging, createKafkaLogCreator } from '../../src/kafka-logging.js';

type Listener = (arg: unknown) => void;

function createFakeClient(kind: 'consumer' | 'producer' | 'admin') {
	const listeners = new Map<string, Listener[]>();
	return {
		events: {
			CONNECT: `${kind}.connect`,
			DISCONNECT: `${kind}.disconnect`,
			CRASH: `${kind}.crash`,
		},
		on(event: string, listener: Listener) {
			listeners.set(event, [...(listeners.get(event) ?? []), listener]);
			return this;
		},
		emit(event: string, arg: unknown) {
			for (const listener of listeners.get(event) ?? []) {
				listener(arg);
			}
		},
	};
}

const logger = {
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
};

afterEach(() => {
	vi.clearAllMocks();
});

describe('attachConnectionLogging', () => {
	it('does not report a reconnect for the second CONNECT kafkajs emits at boot', () => {
		const client = createFakeClient('consumer');
		attachConnectionLogging({
			client: client as unknown as Consumer,
			logger,
			clientType: 'consumer',
			groupId: 'feed-group',
		});

		client.emit('consumer.connect', { id: 2, type: 'consumer.connect' });
		client.emit('consumer.connect', { id: 7, type: 'consumer.connect' });

		expect(logger.info).not.toHaveBeenCalled();
		expect(logger.debug).toHaveBeenCalledTimes(1);
		expect(logger.debug).toHaveBeenCalledWith(
			{ groupId: 'feed-group', id: 2, type: 'consumer.connect' },
			'Kafka consumer connected',
		);
	});

	it('reports a real reconnect after a disconnect', () => {
		const client = createFakeClient('consumer');
		attachConnectionLogging({
			client: client as unknown as Consumer,
			logger,
			clientType: 'consumer',
			groupId: 'feed-group',
		});

		client.emit('consumer.connect', { id: 2 });
		client.emit('consumer.disconnect', { id: 3 });
		client.emit('consumer.connect', { id: 4 });

		expect(logger.warn).toHaveBeenCalledWith(
			{ groupId: 'feed-group', id: 3 },
			'Kafka consumer disconnected',
		);
		expect(logger.info).toHaveBeenCalledWith(
			{ groupId: 'feed-group', id: 4 },
			'Kafka consumer reconnected',
		);
	});

	it('keeps one info line for a producer and an admin', () => {
		const producer = createFakeClient('producer');
		const admin = createFakeClient('admin');
		attachConnectionLogging({
			client: producer as unknown as Producer,
			logger,
			clientType: 'producer',
		});
		attachConnectionLogging({ client: admin as unknown as Admin, logger, clientType: 'admin' });

		producer.emit('producer.connect', { id: 5 });
		producer.emit('producer.connect', { id: 6 });
		admin.emit('admin.connect', { id: 1 });

		expect(logger.info).toHaveBeenCalledTimes(2);
		expect(logger.info).toHaveBeenCalledWith({ id: 5 }, 'Kafka producer connected');
		expect(logger.info).toHaveBeenCalledWith({ id: 1 }, 'Kafka admin connected');
	});

	it('separates a retriable crash from a fatal one', () => {
		const client = createFakeClient('consumer');
		attachConnectionLogging({
			client: client as unknown as Consumer,
			logger,
			clientType: 'consumer',
			groupId: 'feed-group',
		});

		client.emit('consumer.crash', {
			payload: { restart: true, error: new Error('rebalance in progress') },
		});
		expect(logger.warn).toHaveBeenCalledWith(
			{ groupId: 'feed-group', restart: true, error: 'rebalance in progress' },
			'Kafka consumer crashed, kafkajs will retry',
		);
		expect(logger.error).not.toHaveBeenCalled();

		client.emit('consumer.crash', {
			payload: { restart: false, error: new Error('number of retries exceeded') },
		});
		expect(logger.error).toHaveBeenCalledWith(
			{ groupId: 'feed-group', restart: false, error: 'number of retries exceeded' },
			'Kafka consumer crashed',
		);
	});
});

describe('createKafkaLogCreator', () => {
	const emit = (level: number, log: Record<string, unknown>) => {
		createKafkaLogCreator(logger)(logLevel.WARN)({
			namespace: 'Connection',
			level,
			label: 'ERROR',
			log: { message: 'Connection error', timestamp: '', ...log } as never,
		});
	};

	it('reports a repeated entry once and keeps the repeats at debug', () => {
		const entry = createKafkaLogCreator(logger)(logLevel.WARN);
		const emitOnce = (message: string) =>
			entry({
				namespace: 'Connection',
				level: logLevel.ERROR,
				label: 'ERROR',
				log: { message, timestamp: '', broker: 'kafka:9092' } as never,
			});

		const emitRetry = () =>
			entry({
				namespace: 'BrokerPool',
				level: logLevel.WARN,
				label: 'WARN',
				log: { message: 'Failed to connect to seed broker', timestamp: '', retryCount: 1 } as never,
			});

		emitOnce('Connection error: connect ECONNREFUSED');
		emitRetry();
		emitOnce('Connection error: connect ECONNREFUSED');
		emitRetry();
		emitOnce('Connection error: connect ECONNREFUSED');

		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logger.debug).toHaveBeenCalledTimes(4);
		expect(logger.debug).toHaveBeenLastCalledWith(
			{ namespace: 'kafkajs', timestamp: '', broker: 'kafka:9092', repeat: 2 },
			'Connection error: connect ECONNREFUSED',
		);

		emitOnce('Connection error: read ECONNRESET');
		expect(logger.error).toHaveBeenCalledTimes(2);
	});

	it('routes a retry-in-progress entry to debug, not error', () => {
		emit(logLevel.ERROR, { retryCount: 2, retryTime: 300 });

		expect(logger.error).not.toHaveBeenCalled();
		expect(logger.debug).toHaveBeenCalledWith(
			{ namespace: 'kafkajs', timestamp: '', retryCount: 2, retryTime: 300 },
			'Connection error',
		);
	});

	it('keeps a terminal error at error level and drops the stack', () => {
		emit(logLevel.ERROR, { stack: 'Error: boom\n    at <anonymous>', broker: 'localhost:9092' });

		expect(logger.error).toHaveBeenCalledWith(
			{ namespace: 'kafkajs', timestamp: '', broker: 'localhost:9092' },
			'Connection error',
		);
	});
});
