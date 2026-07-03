import { describe, test, expect, beforeAll, afterEach, vi } from 'vitest';
import { runOutboxRelayBatch } from '../../workers/outbox-relay.batch';

let db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
let messagesOutboxService: typeof import('@/modules/messages-outbox/messages-outbox.service').messagesOutboxService;

const producer = { sendMessage: vi.fn() };

beforeAll(async () => {
	({ db } = await import('@/db/postgres'));
	({ messagesOutboxService } = await import('@/modules/messages-outbox/messages-outbox.service'));
});

afterEach(async () => {
	vi.clearAllMocks();
	await db.query('TRUNCATE messages_outbox CASCADE');
});

describe('Outbox relay integration', () => {
	test('reads pending rows, calls producer, marks them sent', async () => {
		await db.query(
			`INSERT INTO messages_outbox (topic, payload, correlation_id, status)
			 VALUES
			   ($1, $2, 'corr-1', 'pending'),
			   ($3, $4, 'corr-2', 'pending')`,
			[
				'post.created.v1',
				JSON.stringify({ key: 'post-1', value: '{"v":1,"postId":"post-1"}' }),
				'post.fan-out.v1',
				JSON.stringify({ key: 'follower-1', value: '{"id":"post-1"}', partition: 2 }),
			],
		);

		producer.sendMessage.mockResolvedValue(undefined);

		const result = await runOutboxRelayBatch({
			outboxService: messagesOutboxService,
			producer,
		});

		expect(result.pendingCount).toBe(2);
		expect(result.publishedCount).toBe(2);
		expect(result.markedSentCount).toBe(2);
		expect(producer.sendMessage).toHaveBeenCalledTimes(2);
		expect(producer.sendMessage).toHaveBeenCalledWith('post.created.v1', [
			expect.objectContaining({ key: 'post-1' }),
		]);
		expect(producer.sendMessage).toHaveBeenCalledWith('post.fan-out.v1', [
			expect.objectContaining({ key: 'follower-1', partition: 2 }),
		]);

		const { rows } = await db.query(`SELECT status FROM messages_outbox`);
		expect((rows as { status: string }[]).every(r => r.status === 'sent')).toBe(true);
	});

	test('sends multiple rows on the same topic in one producer call', async () => {
		await db.query(
			`INSERT INTO messages_outbox (topic, payload, correlation_id, status)
			 VALUES
			   ($1, $2, 'corr-1', 'pending'),
			   ($3, $4, 'corr-2', 'pending')`,
			[
				'post.fan-out.v1',
				JSON.stringify({ key: 'follower-1', value: '{"id":"post-1"}', partition: 2 }),
				'post.fan-out.v1',
				JSON.stringify({ key: 'follower-2', value: '{"id":"post-1"}', partition: 5 }),
			],
		);

		producer.sendMessage.mockResolvedValue(undefined);

		const result = await runOutboxRelayBatch({
			outboxService: messagesOutboxService,
			producer,
		});

		expect(result.pendingCount).toBe(2);
		expect(result.publishedCount).toBe(2);
		expect(result.markedSentCount).toBe(2);
		expect(producer.sendMessage).toHaveBeenCalledTimes(1);
		expect(producer.sendMessage).toHaveBeenCalledWith('post.fan-out.v1', [
			expect.objectContaining({ key: 'follower-1', partition: 2 }),
			expect.objectContaining({ key: 'follower-2', partition: 5 }),
		]);

		const { rows } = await db.query(`SELECT status FROM messages_outbox`);
		expect((rows as { status: string }[]).every(r => r.status === 'sent')).toBe(true);
	});

	test('leaves rows pending when producer throws', async () => {
		await db.query(
			`INSERT INTO messages_outbox (topic, payload, correlation_id, status)
			 VALUES ($1, $2, 'corr-1', 'pending')`,
			['post.created.v1', JSON.stringify({ key: 'post-1', value: '{}' })],
		);

		producer.sendMessage.mockRejectedValue(new Error('publish failed'));

		const result = await runOutboxRelayBatch({
			outboxService: messagesOutboxService,
			producer,
		});

		expect(result.publishedCount).toBe(0);
		expect(result.markedSentCount).toBe(0);

		const { rows } = await db.query(`SELECT status FROM messages_outbox`);
		expect(rows[0]).toMatchObject({ status: 'pending' });
	});

	test('publishes successful rows and leaves failed ones pending in a mixed batch', async () => {
		await db.query(
			`INSERT INTO messages_outbox (topic, payload, correlation_id, status)
			 VALUES
			   ($1, $2, 'corr-1', 'pending'),
			   ($3, $4, 'corr-2', 'pending')`,
			[
				'post.created.v1',
				JSON.stringify({ key: 'ok', value: '{}' }),
				'post.fan-out.v1',
				JSON.stringify({ key: 'boom', value: '{}' }),
			],
		);

		producer.sendMessage.mockImplementation((topic: string) => {
			if (topic === 'post.fan-out.v1') {
				return Promise.reject(new Error('publish failed'));
			}
			return Promise.resolve(undefined);
		});

		const result = await runOutboxRelayBatch({
			outboxService: messagesOutboxService,
			producer,
		});

		expect(result.pendingCount).toBe(2);
		expect(result.publishedCount).toBe(1);
		expect(result.markedSentCount).toBe(1);

		const { rows } = await db.query(`SELECT topic, status FROM messages_outbox ORDER BY topic`);
		expect(rows).toContainEqual({ topic: 'post.created.v1', status: 'sent' });
		expect(rows).toContainEqual({ topic: 'post.fan-out.v1', status: 'pending' });
	});
});
