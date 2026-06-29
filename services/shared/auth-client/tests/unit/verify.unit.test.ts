import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import {
	cachedUserContext,
	defaultAuthClientCfg,
	sampleBearer,
	sampleToken,
	TEST_AUDIENCE,
	TEST_ISSUER,
	TEST_USER_ID,
} from '../fixtures/tokens.js';

const { mockClient, mockJwtVerify, mockCreateRemoteJWKSet } = vi.hoisted(() => {
	const mockClient = {
		connect: vi.fn(() => Promise.resolve()),
		quit: vi.fn(() => Promise.resolve()),
		set: vi.fn(() => Promise.resolve()),
		get: vi.fn<() => Promise<string | null>>(() => Promise.resolve(null)),
		on: vi.fn(),
		isOpen: false,
	};
	const mockJwtVerify = vi.fn();
	const mockCreateRemoteJWKSet = vi.fn(() => 'mock-jwks');
	return { mockClient, mockJwtVerify, mockCreateRemoteJWKSet };
});

vi.mock('redis', () => ({
	createClient: vi.fn(() => mockClient),
}));

vi.mock('jose', () => ({
	createRemoteJWKSet: mockCreateRemoteJWKSet,
	jwtVerify: mockJwtVerify,
}));

import { createAuthClient, type AuthClient } from '../../src/index.js';

describe('createAuthClient.verify', () => {
	let authClient: AuthClient;

	beforeEach(() => {
		mockClient.get.mockResolvedValue(null);
		mockClient.set.mockResolvedValue(undefined);
		mockJwtVerify.mockResolvedValue({
			payload: {
				sub: '11111111-1111-1111-1111-111111111111',
				exp: Math.floor(Date.now() / 1000) + 300,
			},
		});
		authClient = createAuthClient(defaultAuthClientCfg);
	});

	afterAll(async () => {
		await authClient?.disconnect();
	});

	test('returns cached context on cache hit without calling jwtVerify', async () => {
		mockClient.get.mockResolvedValueOnce(JSON.stringify(cachedUserContext));

		const result = await authClient.verify(sampleBearer);

		expect(result).toEqual(cachedUserContext);
		expect(mockClient.get).toHaveBeenCalledWith(`auth:${sampleToken}`);
		expect(mockJwtVerify).not.toHaveBeenCalled();
	});

	test('verifies via JWKS on cache miss and caches the result', async () => {
		const exp = Math.floor(Date.now() / 1000) + 300;
		mockJwtVerify.mockResolvedValueOnce({ payload: { sub: TEST_USER_ID, exp } });

		const result = await authClient.verify(sampleBearer);

		expect(result).toEqual({ userId: TEST_USER_ID, tokenExp: exp });
		expect(mockJwtVerify).toHaveBeenCalledWith(sampleToken, 'mock-jwks', {
			audience: TEST_AUDIENCE,
			issuer: TEST_ISSUER,
		});
		expect(mockClient.set).toHaveBeenCalledWith(
			`auth:${sampleToken}`,
			JSON.stringify({ userId: TEST_USER_ID, tokenExp: exp }),
			{ EX: expect.any(Number) as number },
		);
	});

	test('continues verification when Redis get fails', async () => {
		mockClient.get.mockRejectedValueOnce(new Error('Redis down'));
		const exp = Math.floor(Date.now() / 1000) + 300;
		mockJwtVerify.mockResolvedValueOnce({ payload: { sub: TEST_USER_ID, exp } });

		const result = await authClient.verify(sampleBearer);

		expect(result).toEqual({ userId: TEST_USER_ID, tokenExp: exp });
		expect(mockJwtVerify).toHaveBeenCalled();
	});

	test('propagates jwtVerify errors', async () => {
		mockJwtVerify.mockRejectedValueOnce(new Error('invalid token'));
		await expect(authClient.verify(sampleBearer)).rejects.toThrow('invalid token');
		expect(mockClient.set).not.toHaveBeenCalled();
	});

	test('sets cache TTL at 60 seconds', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
		const now = Math.floor(Date.now() / 1000);
		const exp = now + 120;
		mockJwtVerify.mockResolvedValueOnce({ payload: { sub: TEST_USER_ID, exp } });

		await authClient.verify(sampleBearer);

		expect(mockClient.set).toHaveBeenCalledWith(
			`auth:${sampleToken}`,
			JSON.stringify({ userId: TEST_USER_ID, tokenExp: exp }),
			{ EX: 60 },
		);
		vi.useRealTimers();
	});

	test('uses remaining TTL when under 60 seconds', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
		const now = Math.floor(Date.now() / 1000);
		const exp = now + 30;
		mockJwtVerify.mockResolvedValueOnce({ payload: { sub: TEST_USER_ID, exp } });

		await authClient.verify(sampleBearer);

		expect(mockClient.set).toHaveBeenCalledWith(
			`auth:${sampleToken}`,
			JSON.stringify({ userId: TEST_USER_ID, tokenExp: exp }),
			{ EX: 30 },
		);
		vi.useRealTimers();
	});

	test('skips cache write when TTL is zero', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
		const exp = Math.floor(Date.now() / 1000);
		mockJwtVerify.mockResolvedValueOnce({ payload: { sub: TEST_USER_ID, exp } });

		const result = await authClient.verify(sampleBearer);

		expect(result).toEqual({ userId: TEST_USER_ID, tokenExp: exp });
		expect(mockClient.set).not.toHaveBeenCalled();
		vi.useRealTimers();
	});
});
