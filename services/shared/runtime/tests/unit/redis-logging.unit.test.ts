import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachRedisLogging, isRedisDown } from '../../src/redis-logging.js';

type Listener = (arg?: unknown) => void;

function createFakeClient() {
	const listeners = new Map<string, Listener>();
	return {
		on(event: string, listener: Listener) {
			listeners.set(event, listener);
			return this;
		},
		emit(event: string, arg?: unknown) {
			listeners.get(event)?.(arg);
		},
	};
}

function connectionError(): Error {
	const inner = Object.assign(new Error('connect ECONNREFUSED ::1:6379'), {
		code: 'ECONNREFUSED',
	});
	return new AggregateError([inner]);
}

const logger = {
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
};

describe('isRedisDown', () => {
	it('unwraps the AggregateError node-redis emits on a failed socket attempt', () => {
		expect(connectionError().message).toBe('');
		expect(isRedisDown(connectionError())).toBe(true);
	});

	it('recognises a dropped socket, which node-redis reports as a plain Error', () => {
		expect(isRedisDown(new Error('Socket closed unexpectedly'))).toBe(true);
		expect(isRedisDown(new Error('read ECONNRESET'))).toBe(true);
	});

	it('recognises the node-redis client error classes', () => {
		const error = new Error('the client is closed');
		error.name = 'ClientClosedError';
		expect(isRedisDown(error)).toBe(true);
	});

	it('does not classify a command error as a connection failure', () => {
		expect(isRedisDown(new Error('WRONGTYPE Operation against a key'))).toBe(false);
		expect(isRedisDown('not an error')).toBe(false);
	});
});

describe('attachRedisLogging', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('logs one warn for an outage no matter how many attempts fail', () => {
		const client = createFakeClient();
		attachRedisLogging(client, logger, { component: 'fan-out-service' });

		client.emit('ready');
		for (let i = 0; i < 50; i += 1) {
			client.emit('error', connectionError());
		}

		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(logger.warn).toHaveBeenCalledWith(
			{
				component: 'fan-out-service',
				reason: 'connect ECONNREFUSED ::1:6379',
				code: 'ECONNREFUSED',
			},
			'Redis connection lost',
		);
		expect(logger.debug).toHaveBeenCalledTimes(49);
	});

	it('logs one info on recovery with the outage duration', () => {
		const client = createFakeClient();
		attachRedisLogging(client, logger, { component: 'fan-out-service' });

		client.emit('ready');
		expect(logger.info).toHaveBeenCalledWith({ component: 'fan-out-service' }, 'Redis connected');

		client.emit('error', connectionError());
		client.emit('error', connectionError());
		vi.advanceTimersByTime(42_150);
		client.emit('ready');

		expect(logger.info).toHaveBeenLastCalledWith(
			{ component: 'fan-out-service', downForMs: 42_150, attempts: 2 },
			'Redis connection restored',
		);
		expect(logger.info).toHaveBeenCalledTimes(2);
	});

	it('reports each outage again after recovery', () => {
		const client = createFakeClient();
		attachRedisLogging(client, logger, { component: 'auth-client' });

		client.emit('ready');
		client.emit('error', connectionError());
		client.emit('ready');
		client.emit('error', connectionError());

		expect(logger.warn).toHaveBeenCalledTimes(2);
	});

	it('logs a command error without flipping connection state', () => {
		const client = createFakeClient();
		attachRedisLogging(client, logger, { component: 'auth-client' });

		client.emit('ready');
		client.emit('error', new Error('WRONGTYPE Operation against a key'));

		expect(logger.warn).toHaveBeenCalledWith(
			{ component: 'auth-client', reason: 'WRONGTYPE Operation against a key' },
			'Redis client error',
		);

		client.emit('error', connectionError());
		expect(logger.warn).toHaveBeenLastCalledWith(
			{ component: 'auth-client', reason: 'connect ECONNREFUSED ::1:6379', code: 'ECONNREFUSED' },
			'Redis connection lost',
		);
	});
});
