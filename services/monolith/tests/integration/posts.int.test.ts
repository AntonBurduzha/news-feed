import { describe, test, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Post } from '@/modules/posts/posts.types';
import type { MessageOutbox } from '@/modules/messages-outbox/messages-outbox.types';
import { getTestApp } from './app-setup';
import { setDefaultActor } from './auth-mock';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const MISSING_USER_ID = '22222222-2222-4222-8222-222222222222';
const MISSING_POST_ID = '33333333-3333-4333-8333-333333333333';

vi.mock('@news-feed/auth-client', async () => {
	const { createAuthClient } = await import('./auth-mock');
	return { createAuthClient };
});

type PostsPage = { posts: Post[]; nextCursor: string | null };

let app: import('express').Express;
let db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
let internalApiKey: string;

function createPost(content: string) {
	return request(app).post('/posts').send({ content }).expect(201);
}

beforeAll(async () => {
	setDefaultActor(USER_ID);
	({ db } = await import('@/db/postgres'));
	app = await getTestApp();
	internalApiKey = process.env.INTERNAL_API_KEY as string;

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
				.send({ content: 'integration test' })
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
				.send({ content: '' })
				.expect(400);
			expect(response.body.error).toBe('Validation failed');

			const { rows } = await db.query('SELECT id FROM posts');
			expect(rows as Partial<Post>[]).toHaveLength(0);
		});

		test('throws NotFoundError when the author does not exist', async () => {
			await request(app)
				.post('/posts')
				.set('Authorization', `Bearer ${MISSING_USER_ID}`)
				.send({ content: 'hi' })
				.expect(404);

			const { rows } = await db.query('SELECT id FROM posts');
			expect(rows as Partial<Post>[]).toHaveLength(0);
		});
	});

	describe('POST /internal/posts/by-authors', () => {
		test('returns the posts written by the given authors', async () => {
			await createPost('p1');
			await createPost('p2');

			const response: { body: PostsPage } = await request(app)
				.post('/internal/posts/by-authors')
				.set('x-internal-api-key', internalApiKey)
				.send({ ids: [USER_ID], limit: 10 })
				.expect(200);

			expect(response.body.posts.map(post => post.content).sort()).toEqual(['p1', 'p2']);
			expect(response.body.nextCursor).toBeNull();
		});

		test('returns an empty page when the authors have no posts', async () => {
			await createPost('p1');

			const response: { body: PostsPage } = await request(app)
				.post('/internal/posts/by-authors')
				.set('x-internal-api-key', internalApiKey)
				.send({ ids: [MISSING_USER_ID] })
				.expect(200);

			expect(response.body.posts).toHaveLength(0);
			expect(response.body.nextCursor).toBeNull();
		});

		test('walks the whole author timeline through the cursor', async () => {
			await createPost('p1');
			await createPost('p2');

			const firstPage: { body: PostsPage } = await request(app)
				.post('/internal/posts/by-authors')
				.set('x-internal-api-key', internalApiKey)
				.send({ ids: [USER_ID], limit: 1 })
				.expect(200);

			expect(firstPage.body.posts).toHaveLength(1);
			expect(firstPage.body.nextCursor).toEqual(expect.any(String));

			const secondPage: { body: PostsPage } = await request(app)
				.post('/internal/posts/by-authors')
				.set('x-internal-api-key', internalApiKey)
				.send({ ids: [USER_ID], limit: 1, cursor: firstPage.body.nextCursor })
				.expect(200);

			expect(secondPage.body.posts).toHaveLength(1);
			expect(secondPage.body.nextCursor).toBeNull();

			const paged = [...firstPage.body.posts, ...secondPage.body.posts];
			expect(paged.map(post => post.content).sort()).toEqual(['p1', 'p2']);
		});

		test('rejects a request without the internal api key', async () => {
			const response: { body: { error: string } } = await request(app)
				.post('/internal/posts/by-authors')
				.send({ ids: [USER_ID] })
				.expect(401);
			expect(response.body.error).toBe('Invalid internal key');
		});

		test('throws ValidationError when the author ids are not uuids', async () => {
			const response: { body: { error: string } } = await request(app)
				.post('/internal/posts/by-authors')
				.set('x-internal-api-key', internalApiKey)
				.send({ ids: ['not-a-uuid'] })
				.expect(400);
			expect(response.body.error).toBe('Validation failed');
		});
	});

	describe('DELETE /posts/:id', () => {
		test('deletes the post and writes a pending post.deleted.v1 outbox row with userId', async () => {
			const response: { body: Post } = await request(app)
				.post('/posts')
				.send({ content: 'to delete' })
				.expect(201);

			await request(app).delete(`/posts/${response.body.id}`).expect(204);

			const { rows: posts } = await db.query('SELECT id FROM posts WHERE id = $1', [
				response.body.id,
			]);
			expect(posts).toHaveLength(0);

			const { rows: outboxMessages } = await db.query(
				`SELECT status, payload FROM messages_outbox
				 WHERE topic = 'post.deleted.v1' AND payload->>'key' = $1`,
				[response.body.id],
			);
			expect(outboxMessages).toHaveLength(1);
			expect(outboxMessages[0]).toMatchObject({ status: 'pending' });
			const payload = (outboxMessages[0] as { payload: { value: string } }).payload;
			expect(JSON.parse(payload.value)).toMatchObject({
				v: 1,
				postId: response.body.id,
				userId: USER_ID,
			});
		});

		test('returns 404 when deleting a non-existent post', async () => {
			await request(app).delete(`/posts/${MISSING_POST_ID}`).expect(404);
		});
	});
});
