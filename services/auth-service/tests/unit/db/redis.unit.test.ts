import { describe, test, expect, vi } from 'vitest';
const { mockClient } = vi.hoisted(() => {
	const mockClient = {
		connect: vi.fn(() => Promise.resolve()),
		quit: vi.fn(),
		set: vi.fn(),
		get: vi.fn(),
		on: vi.fn(),
		isOpen: false,
	};
	return { mockClient };
});
vi.mock('redis', () => ({
	createClient: vi.fn(function () {
		return mockClient;
	}),
}));
import { cacheToken, getCachedToken } from '@/db/redis';

describe('redis', () => {
	test('should set a token in the cache', async () => {
		await cacheToken('test-token', 'test-user-id', 3600);
		expect(mockClient.set).toHaveBeenCalledWith(
			'auth:test-token',
			JSON.stringify({ userId: 'test-user-id' }),
			{ EX: 3600 },
		);
	});

	test('should get a token from the cache', async () => {
		mockClient.get.mockResolvedValueOnce(JSON.stringify({ userId: 'test-user-id' }));
		const result = await getCachedToken('test-token');
		expect(result).toEqual({ userId: 'test-user-id' });
		expect(mockClient.get).toHaveBeenCalledWith('auth:test-token');
	});

	test('should return null if the token is not in the cache', async () => {
		mockClient.get.mockResolvedValueOnce(null);
		const result = await getCachedToken('test-token');
		expect(result).toBeNull();
		expect(mockClient.get).toHaveBeenCalledWith('auth:test-token');
	});
});
