import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
const { mockPool, mockClient } = vi.hoisted(() => {
	const mockClient = {
		query: vi.fn(),
		release: vi.fn(),
	};
	const mockPool = {
		query: vi.fn(),
		connect: vi.fn(() => Promise.resolve(mockClient)),
		on: vi.fn(),
		totalCount: 0,
		idleCount: 0,
		waitingCount: 0,
	};
	return { mockPool, mockClient };
});
vi.mock('pg', () => ({
	Pool: vi.fn(function () {
		return mockPool;
	}),
}));
vi.mock('@/lib/metrics', () => ({
	pgPoolConnections: {
		set: vi.fn(),
	},
}));
import { checkPostgresConnection, withTransaction, startPgPoolMetrics } from '@/db/postgres';
import { pgPoolConnections } from '@/lib/metrics';

describe('checkPostgresConnection', () => {
	test('resolves when the query succeeds', async () => {
		mockPool.query.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
		await expect(checkPostgresConnection()).resolves.toBeUndefined();
		expect(mockPool.query).toHaveBeenCalledWith('SELECT 1');
	});

	test('throws an error when the query fails', async () => {
		const err = new Error('connection refused');
		mockPool.query.mockRejectedValueOnce(err);
		await expect(checkPostgresConnection()).rejects.toThrow(err.message);
	});
});

describe('withTransaction', () => {
	test('commits and releases on success', async () => {
		const result = await withTransaction(async () => 'ok');
		expect(result).toBe('ok');
		expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
		expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
		expect(mockClient.query).not.toHaveBeenCalledWith('ROLLBACK');
		expect(mockClient.release).toHaveBeenCalledOnce();
	});

	test('rolls back and releases when the callback throws', async () => {
		const boom = new Error('boom');
		await expect(
			withTransaction(async () => {
				throw boom;
			}),
		).rejects.toThrow(boom.message);
		expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
		expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
		expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
		expect(mockClient.release).toHaveBeenCalledOnce();
	});
});

describe('startPgPoolMetrics', () => {
	beforeEach(() => vi.useFakeTimers());

	afterEach(() => vi.useRealTimers());

	test('records pool gauges on each tick', () => {
		mockPool.totalCount = 10;
		mockPool.idleCount = 4;
		mockPool.waitingCount = 2;
		const setSpy = vi.spyOn(pgPoolConnections, 'set');
		startPgPoolMetrics();
		vi.advanceTimersByTime(15_000);
		expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ state: 'active' }), 6);
		expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ state: 'idle' }), 4);
		expect(setSpy).toHaveBeenCalledWith(expect.objectContaining({ state: 'waiting' }), 2);
	});
});
