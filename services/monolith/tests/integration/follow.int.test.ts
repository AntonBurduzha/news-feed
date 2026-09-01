import { describe, test, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import type { Follow } from '@/modules/follow/follow.types';
import { getTestApp } from './app-setup';
import { setDefaultActor } from './auth-mock';

const ALICE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CAROL = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MISSING_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MISSING_FOLLOW_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

vi.mock('@news-feed/auth-client', async () => {
	const { createAuthClient } = await import('./auth-mock');
	return { createAuthClient };
});

let app: import('express').Express;
let db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

type FollowRowShape = { id: string; follower_id: string; following_id: string };

function follow(actor: string, followingId: string) {
	return request(app)
		.post('/follows')
		.set('Authorization', `Bearer ${actor}`)
		.send({ followingId });
}

async function allFollows(): Promise<FollowRowShape[]> {
	const { rows } = await db.query('SELECT id, follower_id, following_id FROM follows');
	return rows as FollowRowShape[];
}

beforeAll(async () => {
	setDefaultActor(ALICE);
	({ db } = await import('@/db/postgres'));
	app = await getTestApp();

	for (const [id, name] of [
		[ALICE, 'Alice'],
		[BOB, 'Bob'],
		[CAROL, 'Carol'],
	]) {
		await db.query(
			`INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)
			 ON CONFLICT (id) DO NOTHING`,
			[id, name, `${name.toLowerCase()}@test.com`, 'password_hash'],
		);
	}
});

afterEach(async () => {
	await db.query('TRUNCATE follows, messages_outbox CASCADE');
});

describe('Follow integration tests', () => {
	describe('POST /follows', () => {
		test('creates the follow with the caller as follower and a pending outbox row', async () => {
			const response: { body: Follow } = await follow(ALICE, BOB).expect(201);

			expect(response.body).toMatchObject({ followerId: ALICE, followingId: BOB });

			const rows = await allFollows();
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({ follower_id: ALICE, following_id: BOB });

			const { rows: outbox } = await db.query(
				`SELECT topic, status, payload FROM messages_outbox WHERE payload->>'key' = $1`,
				[response.body.id],
			);
			expect(outbox).toHaveLength(1);
			expect(outbox[0]).toMatchObject({ topic: 'follow.changed.v1', status: 'pending' });
			const payload = (outbox[0] as { payload: { value: string } }).payload;
			expect(JSON.parse(payload.value)).toMatchObject({
				v: 1,
				followerId: ALICE,
				followingId: BOB,
				action: 'created',
			});
		});

		test('ignores a forged followerId in the body and uses the token instead', async () => {
			await request(app)
				.post('/follows')
				.set('Authorization', `Bearer ${ALICE}`)
				.send({ followerId: BOB, followingId: CAROL })
				.expect(201);

			const rows = await allFollows();
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({ follower_id: ALICE, following_id: CAROL });
		});

		test('rejects following yourself', async () => {
			const response: { body: { error: string } } = await follow(ALICE, ALICE).expect(400);
			expect(response.body.error).toBe('User cannot follow itself');
			expect(await allFollows()).toHaveLength(0);
		});

		test('rejects a duplicate follow with 409', async () => {
			await follow(ALICE, BOB).expect(201);

			const response: { body: { error: string } } = await follow(ALICE, BOB).expect(409);
			expect(response.body.error).toBe('Follow already exists');

			expect(await allFollows()).toHaveLength(1);
		});

		test('throws NotFoundError when the followed user does not exist', async () => {
			await follow(ALICE, MISSING_USER_ID).expect(404);
			expect(await allFollows()).toHaveLength(0);
		});

		test('throws ValidationError when followingId is not a uuid', async () => {
			const response: { body: { error: string } } = await request(app)
				.post('/follows')
				.set('Authorization', `Bearer ${ALICE}`)
				.send({ followingId: 'not-a-uuid' })
				.expect(400);
			expect(response.body.error).toBe('Validation failed');
		});
	});

	describe('DELETE /follows/:id', () => {
		test('refuses to delete a follow owned by another user and leaves the row in place', async () => {
			const created: { body: Follow } = await follow(ALICE, BOB).expect(201);

			await request(app)
				.delete(`/follows/${created.body.id}`)
				.set('Authorization', `Bearer ${BOB}`)
				.expect(404);

			const rows = await allFollows();
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({ id: created.body.id, follower_id: ALICE });

			const { rows: outbox } = await db.query(
				`SELECT id FROM messages_outbox WHERE payload->>'value' LIKE '%deleted%'`,
			);
			expect(outbox).toHaveLength(0);
		});

		test('deletes the follow for its owner and writes a pending deleted outbox row', async () => {
			const created: { body: Follow } = await follow(ALICE, BOB).expect(201);
			await db.query('TRUNCATE messages_outbox');

			await request(app)
				.delete(`/follows/${created.body.id}`)
				.set('Authorization', `Bearer ${ALICE}`)
				.expect(204);

			expect(await allFollows()).toHaveLength(0);

			const { rows: outbox } = await db.query(
				`SELECT status, payload FROM messages_outbox WHERE topic = 'follow.changed.v1'`,
			);
			expect(outbox).toHaveLength(1);
			expect(outbox[0]).toMatchObject({ status: 'pending' });
			const payload = (outbox[0] as { payload: { value: string } }).payload;
			expect(JSON.parse(payload.value)).toMatchObject({
				v: 1,
				followerId: ALICE,
				followingId: BOB,
				action: 'deleted',
			});
		});

		test('throws NotFoundError for a follow that does not exist', async () => {
			await request(app)
				.delete(`/follows/${MISSING_FOLLOW_ID}`)
				.set('Authorization', `Bearer ${ALICE}`)
				.expect(404);
		});
	});

	describe('GET /follows/:id', () => {
		test('returns the follower ids of the given user', async () => {
			await follow(ALICE, CAROL).expect(201);
			await follow(BOB, CAROL).expect(201);

			const response: { body: string[] } = await request(app)
				.get(`/follows/${CAROL}`)
				.set('Authorization', `Bearer ${ALICE}`)
				.expect(200);

			expect(response.body.sort()).toEqual([ALICE, BOB].sort());
		});
	});
});
