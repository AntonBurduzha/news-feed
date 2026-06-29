import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from 'redis';
import { createAuthClient } from '../../src/index.js';
import { TEST_AUDIENCE, TEST_ISSUER, TEST_USER_ID } from '../fixtures/tokens.js';
import { generateTestKeyPair, signTestAccessToken } from '../fixtures/sign-token.js';
import { startJwksTestServer, type JwksServer } from '../fixtures/jwks-test-server.js';
import { startRedis, stopRedis } from './redis-setup.js';

describe('createAuthClient.verify integration tests', () => {
	let authClient: ReturnType<typeof createAuthClient>;
	let jwksTestServer: JwksServer;
	let redisUrl: string;
	let token: string;
	const keys = generateTestKeyPair();

	beforeAll(async () => {
		redisUrl = await startRedis();
		jwksTestServer = await startJwksTestServer(keys);
		const exp = Math.floor(Date.now() / 1000) + 300;
		token = await signTestAccessToken({
			sub: TEST_USER_ID,
			exp,
			issuer: TEST_ISSUER,
			audience: TEST_AUDIENCE,
			privateKey: keys.privateKey,
			kid: keys.kid,
		});
		authClient = createAuthClient({
			jwksUrl: jwksTestServer.url,
			issuer: TEST_ISSUER,
			audience: TEST_AUDIENCE,
			redisUrl,
		});
		await new Promise(r => setTimeout(r, 100));
	}, 60_000);

	afterAll(async () => {
		await authClient?.disconnect();
		await jwksTestServer?.close();
		await stopRedis();
	});

	test('verifies a signed JWT and returns UserContext', async () => {
		const result = await authClient.verify(`Bearer ${token}`);
		expect(result).toEqual({
			userId: TEST_USER_ID,
			tokenExp: expect.any(Number) as number,
		});
	});

	test('verifies cached context in Redis', async () => {
		const redis = createClient({ url: redisUrl });
		await redis.connect();
		const cached = await redis.get(`auth:${token}`);
		await redis.quit();

		expect(cached).toBeTruthy();
		const parsed = JSON.parse(cached!) as { userId: string; tokenExp: number };
		expect(parsed.userId).toBe(TEST_USER_ID);
		expect(parsed.tokenExp).toBeGreaterThan(Math.floor(Date.now() / 1000));
	});
});
