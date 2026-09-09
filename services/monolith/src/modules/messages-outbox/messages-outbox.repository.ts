import { PoolClient } from 'pg';
import { db } from '@/db/postgres';
import { MessageOutboxStatus } from './messages-outbox.constants';
import type { CreateMessageOutboxInput, MessageOutboxRow } from './messages-outbox.types';

const BATCH_SIZE = 10;
class MessagesOutboxRepository {
	async create(input: CreateMessageOutboxInput, client?: PoolClient): Promise<void> {
		const connection = client ?? db;
		await connection.query(
			'INSERT INTO messages_outbox (topic, payload, correlation_id, trace_id) VALUES ($1, $2, $3, $4);',
			[input.topic, input.payload, input.correlationId, input.traceId],
		);
	}

	async findPendingMessages(limit = BATCH_SIZE): Promise<MessageOutboxRow[]> {
		const { rows } = await db.query<MessageOutboxRow>(
			`UPDATE messages_outbox
			SET status = $1, claimed_at = NOW()
			WHERE id IN (
				SELECT id FROM messages_outbox
				WHERE status = $2 AND retry_count < max_retries
				ORDER BY created_at
				LIMIT $3
				FOR UPDATE SKIP LOCKED
			)
			RETURNING id, topic, payload, correlation_id, trace_id, retry_count;`,
			[MessageOutboxStatus.Claimed, MessageOutboxStatus.Pending, limit],
		);
		return rows;
	}

	async reclaimStaleMessages(): Promise<number> {
		const result = await db.query(
			`UPDATE messages_outbox
			SET status = $1, claimed_at = NULL
			WHERE status = $2 AND claimed_at < NOW() - INTERVAL '5 minutes';`,
			[MessageOutboxStatus.Pending, MessageOutboxStatus.Claimed],
		);
		return result.rowCount ?? 0;
	}

	async markSent(ids: string[]): Promise<void> {
		await db.query('UPDATE messages_outbox SET sent_at = NOW(), status = $1 WHERE id = ANY($2);', [
			MessageOutboxStatus.Sent,
			ids,
		]);
	}

	async markFailed(ids: string[]): Promise<void> {
		await db.query(
			`
			UPDATE messages_outbox 
			SET retry_count = retry_count + 1, claimed_at = NULL,
			status = CASE WHEN retry_count + 1 >= max_retries THEN $1 ELSE $2 END
			WHERE id = ANY($3);
		`,
			[MessageOutboxStatus.Failed, MessageOutboxStatus.Pending, ids],
		);
	}

	async cleanUpSentMessages(): Promise<number> {
		const result = await db.query(
			"DELETE FROM messages_outbox WHERE status = 'sent' AND sent_at < NOW() - INTERVAL '1 hour';",
		);
		return result.rowCount ?? 0;
	}
}

export const messagesOutboxRepository = new MessagesOutboxRepository();
