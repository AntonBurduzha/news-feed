import { describe, test, expect, beforeAll } from 'vitest';
import request from 'supertest';
import type { RegisterResult, LoginResult, RefreshResult } from '@/modules/auth/auth.types';
import { authFixtures } from '../fixtures/auth';
import { getTestApp } from './app-setup';

let app: import('express').Express;

beforeAll(async () => {
	app = await getTestApp();
});

describe('Auth integration tests', () => {
	const credentials = authFixtures.credentials;

	async function issueRefreshToken(): Promise<string> {
		const response: { body: LoginResult } = await request(app)
			.post('/auth/login')
			.send(credentials)
			.expect(200);
		return response.body.refreshToken;
	}

	describe('/auth/register', () => {
		test('register a new user and issues tokens on success', async () => {
			const response: { body: RegisterResult } = await request(app)
				.post('/auth/register')
				.send(credentials)
				.expect(201);
			expect(response.body.accessToken).toBeDefined();
			expect(response.body.refreshToken).toBeDefined();
			expect(response.body.userId).toBeDefined();
		});

		test('throws ConflictError when trying to register with duplicate email', async () => {
			const response: { body: RegisterResult & { error: string } } = await request(app)
				.post('/auth/register')
				.send(credentials)
				.expect(409);
			expect(response.body.error).toBe('Email already registered');
		});

		test('throws ValidationError when trying to register with invalid email', async () => {
			const response: { body: RegisterResult & { error: string } } = await request(app)
				.post('/auth/register')
				.send({ ...credentials, email: 'invalid-email' })
				.expect(400);
			expect(response.body.error).toBe('Validation failed');
		});
	});

	describe('/auth/login', () => {
		test('issues tokens on successful login', async () => {
			const response: { body: LoginResult } = await request(app)
				.post('/auth/login')
				.send(credentials)
				.expect(200);
			expect(response.body.accessToken).toBeDefined();
			expect(response.body.refreshToken).toBeDefined();
		});

		test('throws Invalid credentials when trying to login with wrong password', async () => {
			const response: { body: LoginResult & { error: string } } = await request(app)
				.post('/auth/login')
				.send({ ...credentials, password: 'wrong' })
				.expect(401);
			expect(response.body.error).toBe('Invalid credentials');
		});

		test('throws Invalid credentials when user does not exist', async () => {
			const response: { body: LoginResult & { error: string } } = await request(app)
				.post('/auth/login')
				.send({ ...credentials, email: 'nonexistent@example.com' })
				.expect(401);
			expect(response.body.error).toBe('Invalid credentials');
		});
	});

	describe('/auth/refresh', () => {
		test('issues a new access token and rotates the refresh token', async () => {
			const refreshToken = await issueRefreshToken();

			const response: { body: RefreshResult } = await request(app)
				.post('/auth/refresh')
				.send({ refreshToken })
				.expect(200);

			expect(response.body.accessToken).toBeDefined();
			expect(response.body.refreshToken).toBeDefined();
			expect(response.body.refreshToken).not.toBe(refreshToken);
		});

		test('throws Invalid refresh token when using invalid refresh token', async () => {
			const response: { body: RefreshResult & { error: string } } = await request(app)
				.post('/auth/refresh')
				.send({ refreshToken: 'invalid-refresh-token' })
				.expect(401);
			expect(response.body.error).toBe('Invalid refresh token');
		});

		test('replaying a rotated token revokes the whole family', async () => {
			const refreshToken = await issueRefreshToken();
			const rotated: { body: RefreshResult } = await request(app)
				.post('/auth/refresh')
				.send({ refreshToken })
				.expect(200);

			const replay: { body: { error: string } } = await request(app)
				.post('/auth/refresh')
				.send({ refreshToken })
				.expect(401);
			expect(replay.body.error).toBe('Invalid refresh token');

			await request(app)
				.post('/auth/refresh')
				.send({ refreshToken: rotated.body.refreshToken })
				.expect(401);
		});
	});

	describe('/auth/logout', () => {
		test('revokes the refresh token family', async () => {
			const refreshToken = await issueRefreshToken();

			await request(app).post('/auth/logout').send({ refreshToken }).expect(200);

			const response: { body: { error: string } } = await request(app)
				.post('/auth/refresh')
				.send({ refreshToken })
				.expect(401);
			expect(response.body.error).toBe('Invalid refresh token');
		});

		test('succeeds for an unknown refresh token', async () => {
			await request(app)
				.post('/auth/logout')
				.send({ refreshToken: 'unknown-refresh-token' })
				.expect(200);
		});

		test('throws ValidationError when the refresh token is missing', async () => {
			const response: { body: { error: string } } = await request(app)
				.post('/auth/logout')
				.send({})
				.expect(400);
			expect(response.body.error).toBe('Validation failed');
		});
	});
});
