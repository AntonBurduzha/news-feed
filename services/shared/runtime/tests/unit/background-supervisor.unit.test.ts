import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackgroundSupervisor } from '../../src/background-supervisor.js';

const logger = {
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
};

describe('BackgroundSupervisor', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.spyOn(Math, 'random').mockReturnValue(0.5);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('retries once service until success', async () => {
		let attempts = 0;
		const supervisor = new BackgroundSupervisor({ logger });

		supervisor.start({
			name: 'redis',
			mode: 'once',
			run: async () => {
				attempts += 1;
				if (attempts < 3) {
					throw new Error('down');
				}
			},
		});
		await vi.advanceTimersByTimeAsync(2_000);
		await vi.advanceTimersByTimeAsync(4_000);
		await supervisor.stop();

		expect(attempts).toBe(3);
		expect(supervisor.getStatus('redis')).toBe('stopped');
	});

	it('calls cleanup before retry', async () => {
		const cleanup = vi.fn().mockResolvedValue(undefined);
		const supervisor = new BackgroundSupervisor({ logger });

		supervisor.start({
			name: 'kafka',
			mode: 'once',
			run: async () => {
				throw new Error('down');
			},
			cleanup,
		});

		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(2_000);
		await supervisor.stop();

		expect(cleanup).toHaveBeenCalled();
	});
});
