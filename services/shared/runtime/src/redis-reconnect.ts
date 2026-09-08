import { computeBackoffDelayMs } from './backoff.js';

export function createRedisReconnectStrategy(options?: {
	initialDelayMs?: number;
	maxDelayMs?: number;
}): (retries: number) => number {
	return (retries: number) =>
		computeBackoffDelayMs(retries + 1, {
			initialDelayMs: options?.initialDelayMs ?? 50,
			maxDelayMs: options?.maxDelayMs ?? 2_000,
			multiplier: 2,
			jitterRatio: 0.2,
		});
}
