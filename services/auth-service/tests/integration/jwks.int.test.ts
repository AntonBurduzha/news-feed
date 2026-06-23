import { describe, test, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from './app-setup';
import { JWK } from 'jose';

let app: import('express').Express;

beforeAll(async () => {
	app = await getTestApp();
});

describe('JWKS integration tests', () => {
	describe('/.well-known/jwks.json', () => {
		test('returns JWKS on success', async () => {
			const response: { body: { keys: JWK[] } } = await request(app)
				.get('/.well-known/jwks.json')
				.expect(200);
			expect(response.body.keys).toBeDefined();
			expect(response.body.keys.length).toBeGreaterThan(0);
		});
	});
});
