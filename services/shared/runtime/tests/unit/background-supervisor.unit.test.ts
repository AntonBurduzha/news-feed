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
			run: async () => {
				throw new Error('down');
			},
			cleanup,
		});
		await supervisor.stop();
		expect(cleanup).toHaveBeenCalled();
	});

	it('stops polling and stays running when no check is supplied', async () => {
		const supervisor = new BackgroundSupervisor({ logger });
		supervisor.start({ name: 'redis', run: async () => {} });

		await vi.advanceTimersByTimeAsync(10_000);
		expect(supervisor.getStatus('redis')).toBe('running');
		await supervisor.stop();
	});

	it("reports degraded but never restarts under policy 'report'", async () => {
		let healthy = true;
		let runs = 0;
		const supervisor = new BackgroundSupervisor({ logger });

		supervisor.start({
			name: 'redis',
			run: async () => {
				runs += 1;
			},
			check: () => healthy,
			checkIntervalMs: 1_000,
			onUnhealthy: 'report',
		});

		await vi.advanceTimersByTimeAsync(1_000);
		expect(supervisor.getStatus('redis')).toBe('running');

		healthy = false;
		await vi.advanceTimersByTimeAsync(5_000);
		expect(supervisor.getStatus('redis')).toBe('retrying');
		expect(runs).toBe(1);

		healthy = true;
		await vi.advanceTimersByTimeAsync(1_000);
		expect(supervisor.getStatus('redis')).toBe('running');
		await supervisor.stop();
	});

	it("re-runs after the threshold under policy 'restart'", async () => {
		let healthy = true;
		let runs = 0;
		const cleanup = vi.fn().mockResolvedValue(undefined);
		const supervisor = new BackgroundSupervisor({ logger });

		supervisor.start({
			name: 'kafka',
			run: async () => {
				runs += 1;
				healthy = true;
			},
			check: () => healthy,
			checkIntervalMs: 1_000,
			unhealthyThreshold: 2,
			onUnhealthy: 'restart',
			cleanup,
		});

		await vi.advanceTimersByTimeAsync(1_000);
		expect(runs).toBe(1);

		healthy = false;
		await vi.advanceTimersByTimeAsync(2_000);
		await vi.advanceTimersByTimeAsync(2_000);

		expect(cleanup).toHaveBeenCalled();
		expect(runs).toBe(2);

		await supervisor.stop();
	});

	it('does not resurrect a stopped service when run() resolves late', async () => {
		let release: () => void;
		const supervisor = new BackgroundSupervisor({ logger });

		supervisor.start({
			name: 'slow',
			run: () =>
				new Promise<void>(resolve => {
					release = resolve;
				}),
		});

		const stopping = supervisor.stop();
		release!();
		await stopping;

		expect(supervisor.getStatus('slow')).toBe('stopped');
	});

	it('gives up on a run() that ignores the abort signal', async () => {
		const supervisor = new BackgroundSupervisor({ logger, stopGracePeriodMs: 1_000 });

		supervisor.start({
			name: 'hung',
			run: () => new Promise<void>(() => {}),
		});

		const stopping = supervisor.stop();
		await vi.advanceTimersByTimeAsync(1_000);
		await stopping;

		expect(supervisor.getStatus('hung')).toBe('stopped');
		expect(logger.warn).toHaveBeenCalled();
	});

	it('rejects a duplicate name and a start after stop', async () => {
		const supervisor = new BackgroundSupervisor({ logger });
		supervisor.start({ name: 'a', run: async () => {} });

		expect(() => supervisor.start({ name: 'a', run: async () => {} })).toThrow(
			/already registered/,
		);

		await supervisor.stop();
		expect(() => supervisor.start({ name: 'b', run: async () => {} })).toThrow(/is stopped/);
	});
});
