import { describe, test, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Post } from '@/modules/posts/posts.types';
import type { MessageOutbox } from '@/modules/messages-outbox/messages-outbox.types';
import { getTestApp } from './app-setup';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const MISSING_USER_ID = '22222222-2222-4222-8222-222222222222';
const MISSING_POST_ID = '33333333-3333-4333-8333-333333333333';

vi.mock('@news-feed/auth-client', () => ({
	createAuthClient: () => ({
		verify: vi.fn(),
		middleware: () => (req: { user?: unknown }, _res: unknown, next: () => void) => {
			req.user = { userId: USER_ID, tokenExp: 0 };
			next();
		},
		disconnect: vi.fn(),
	}),
}));

let app: import('express').Express;
let db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

beforeAll(async () => {
	({ db } = await import('@/db/postgres'));
	app = await getTestApp();

	await db.query(`INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)`, [
		USER_ID,
		'Author',
		'author@test.com',
		'password_hash',
	]);
});

afterEach(async () => {
	await db.query('TRUNCATE posts, messages_outbox CASCADE');
});

describe('Posts integration tests', () => {
	describe('POST /posts', () => {
		test('creates the post and a pending post.created.v1 outbox row', async () => {
			const response: { body: Post } = await request(app)
				.post('/posts')
				.send({ userId: USER_ID, content: 'integration test' })
				.expect(201);

			expect(response.body.id).toBeDefined();

			const { rows: posts } = await db.query('SELECT id, content FROM posts WHERE id = $1', [
				response.body.id,
			]);
			expect(posts).toHaveLength(1);
			expect((posts[0] as Partial<Post>).content).toBe('integration test');

			const { rows: outbox } = await db.query(
				`SELECT topic, status FROM messages_outbox WHERE payload->>'key' = $1`,
				[response.body.id],
			);
			expect(outbox as Partial<MessageOutbox>[]).toContainEqual({
				topic: 'post.created.v1',
				status: 'pending',
			});
		});

		test('throws ValidationError when content is empty', async () => {
			const response: { body: { error: string } } = await request(app)
				.post('/posts')
				.send({ userId: USER_ID, content: '' })
				.expect(400);
			expect(response.body.error).toBe('Validation failed');

			const { rows } = await db.query('SELECT id FROM posts');
			expect(rows as Partial<Post>[]).toHaveLength(0);
		});

		test('throws NotFoundError when the author does not exist', async () => {
			await request(app)
				.post('/posts')
				.send({ userId: MISSING_USER_ID, content: 'hi' })
				.expect(404);

			const { rows } = await db.query('SELECT id FROM posts');
			expect(rows as Partial<Post>[]).toHaveLength(0);
		});
	});

	describe('GET /posts', () => {
		test('returns posts for the user', async () => {
			await request(app).post('/posts').send({ userId: USER_ID, content: 'p1' }).expect(201);

			const response: { body: { posts: Post[]; nextCursor: string | null } } = await request(app)
				.get('/posts')
				.query({ userId: USER_ID, limit: 10 })
				.expect(200);

			expect(response.body.posts).toHaveLength(1);
			expect(response.body.posts[0].content).toBe('p1');
		});

		test('throws ValidationError when userId is missing', async () => {
			const response: { body: { error: string } } = await request(app)
				.get('/posts')
				.query({ limit: 10 })
				.expect(400);
			expect(response.body.error).toBe('Validation failed');
		});
	});

	describe('DELETE /posts/:id', () => {
		test('deletes the post and writes a pending post.deleted.v1 outbox row', async () => {
			const response: { body: Post } = await request(app)
				.post('/posts')
				.send({ userId: USER_ID, content: 'to delete' })
				.expect(201);

			await request(app).delete(`/posts/${response.body.id}`).expect(204);

			const { rows: posts } = await db.query('SELECT id FROM posts WHERE id = $1', [
				response.body.id,
			]);
			expect(posts).toHaveLength(0);

			const { rows: outboxMessages } = await db.query(
				`SELECT status FROM messages_outbox WHERE topic = 'post.deleted.v1' AND payload->>'key' = $1`,
				[response.body.id],
			);
			expect(outboxMessages).toHaveLength(1);
			expect(outboxMessages[0]).toMatchObject({ status: 'pending' });
		});

		test('returns 404 when deleting a non-existent post', async () => {
			await request(app).delete(`/posts/${MISSING_POST_ID}`).expect(404);
		});
	});
});
