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
		let refreshToken: string = '';
		beforeAll(async () => {
			const response: { body: LoginResult } = await request(app)
				.post('/auth/login')
				.send(credentials)
				.expect(200);
			refreshToken = response.body.refreshToken;
		});
		test('issues new access token on successful refresh', async () => {
			const response: { body: RefreshResult } = await request(app)
				.post('/auth/refresh')
				.send({ refreshToken })
				.expect(200);
			expect(response.body.accessToken).toBeDefined();
		});

		test('throws Invalid refresh token when using invalid refresh token', async () => {
			const response: { body: RefreshResult & { error: string } } = await request(app)
				.post('/auth/refresh')
				.send({ refreshToken: 'invalid-refresh-token' })
				.expect(401);
			expect(response.body.error).toBe('Invalid refresh token');
		});
	});
});
