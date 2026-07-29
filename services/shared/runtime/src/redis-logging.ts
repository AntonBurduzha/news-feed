import type { RuntimeLogger } from './background-supervisor.js';

export type RedisEventClient = {
	on(event: 'error', listener: (error: unknown) => void): unknown;
	on(event: 'ready', listener: () => void): unknown;
};

export type RedisLoggingOptions = {
	component: string;
};

const CONNECTION_ERROR_NAMES = [
	'ClientClosedError',
	'ClientOfflineError',
	'ConnectionTimeoutError',
	'SocketClosedUnexpectedlyError',
];

const CONNECTION_ERROR_MESSAGE =
	/ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EPIPE|EHOSTUNREACH|ENETUNREACH|socket closed|connection is closed|offline/i;

function unwrap(error: Error): Error {
	if (error instanceof AggregateError && error.errors.length > 0) {
		const [first] = error.errors as unknown[];
		if (first instanceof Error) {
			return first;
		}
	}
	if (error.cause instanceof Error) {
		return error.cause;
	}
	return error;
}

export function isRedisDown(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}
	for (let current = error, depth = 0; depth < 3; depth += 1) {
		if (CONNECTION_ERROR_NAMES.includes(current.name)) {
			return true;
		}
		if (CONNECTION_ERROR_MESSAGE.test(current.message)) {
			return true;
		}
		const next = unwrap(current);
		if (next === current) {
			return false;
		}
		current = next;
	}
	return false;
}

function describeError(error: unknown): { reason: string; code?: string } {
	if (!(error instanceof Error)) {
		return { reason: String(error) };
	}
	const root = unwrap(error);
	const code = (root as Error & { code?: string }).code;
	return {
		reason: root.message || root.name,
		...(code ? { code } : {}),
	};
}

export function attachRedisLogging(
	client: RedisEventClient,
	logger: RuntimeLogger,
	options: RedisLoggingOptions,
): void {
	const { component } = options;
	let down = false;
	let downSince = 0;
	let attempts = 0;
	let everConnected = false;

	client.on('error', error => {
		if (!isRedisDown(error)) {
			logger.warn({ component, ...describeError(error) }, 'Redis client error');
			return;
		}

		attempts += 1;
		if (down) {
			logger.debug?.(
				{ component, attempts, ...describeError(error) },
				'Redis reconnect attempt failed',
			);
			return;
		}

		down = true;
		downSince = Date.now();
		logger.warn({ component, ...describeError(error) }, 'Redis connection lost');
	});

	client.on('ready', () => {
		if (down) {
			logger.info(
				{ component, downForMs: Date.now() - downSince, attempts },
				'Redis connection restored',
			);
		} else if (!everConnected) {
			logger.info({ component }, 'Redis connected');
		}

		down = false;
		attempts = 0;
		everConnected = true;
	});
}
