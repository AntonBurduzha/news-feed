import { describe, test, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { getTestApp } from './app-setup';

let app: import('express').Express;

beforeAll(async () => {
	app = await getTestApp();
});

describe('Health integration tests', () => {
	describe('/healthz', () => {
		test('returns status ok on success', async () => {
			const response: { body: { status: string; uptime: number; timestamp: string } } =
				await request(app).get('/healthz').expect(200);
			expect(response.body.status).toBe('ok');
			expect(response.body.uptime).toBeDefined();
			expect(response.body.timestamp).toBeDefined();
		});
	});

	describe('/readyz', () => {
		test('returns status ready on success', async () => {
			const response: { body: { status: string } } = await request(app).get('/readyz').expect(200);
			expect(response.body.status).toBe('ready');
		});
	});
});
