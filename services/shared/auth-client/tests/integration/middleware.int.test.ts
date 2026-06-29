import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAuthClient } from '../../src/index.js';
import { TEST_AUDIENCE, TEST_ISSUER, TEST_USER_ID } from '../fixtures/tokens.js';
import { generateTestKeyPair, signTestAccessToken } from '../fixtures/sign-token.js';
import { startJwksTestServer, type JwksServer } from '../fixtures/jwks-test-server.js';
import { startRedis, stopRedis } from './redis-setup.js';

describe('createAuthClient.middleware integration tests', () => {
	let authClient: ReturnType<typeof createAuthClient>;
	let jwksTestServer: JwksServer;
	let app: express.Express;
	let token: string;

	beforeAll(async () => {
		const keys = generateTestKeyPair();
		const redisUrl = await startRedis();
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

		app = express();
		app.get('/protected', authClient.middleware(), (req, res) => {
			res.json({ userId: (req as express.Request & { user?: { userId: string } }).user?.userId });
		});
	}, 60_000);

	afterAll(async () => {
		await authClient?.disconnect();
		await jwksTestServer?.close();
		await stopRedis();
	});

	test('returns 401 without authorization header', async () => {
		const res = await request(app).get('/protected').expect(401);
		expect(res.body).toEqual({ error: 'Missing token' });
	});

	test('returns 200 with valid bearer token', async () => {
		const res = await request(app)
			.get('/protected')
			.set('Authorization', `Bearer ${token}`)
			.expect(200);
		expect(res.body).toEqual({ userId: TEST_USER_ID });
	});
});
