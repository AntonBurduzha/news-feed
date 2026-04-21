import { PoolClient } from 'pg';
import { db } from '@/db/postgres';
import type {
	CreateMessageOutboxInput,
	MessageOutboxRow,
	MessageOutboxStatus,
} from './messages-outbox.types';

class MessagesOutboxRepository {
	async create(input: CreateMessageOutboxInput, client?: PoolClient): Promise<void> {
		const connection = client ?? db;
		await connection.query('INSERT INTO messages_outbox (topic, payload) VALUES ($1, $2);', [
			input.topic,
			input.payload,
		]);
	}

	async findPendingMessages(): Promise<MessageOutboxRow[]> {
		const { rows } = await db.query<MessageOutboxRow>(
			`SELECT id, topic, payload
			FROM messages_outbox
			WHERE status = 'pending' AND retry_count < max_retries
			ORDER BY created_at
			LIMIT 10
			FOR UPDATE SKIP LOCKED;
			`,
		);
		return rows;
	}

	async updateMessageStatus(ids: number[], status: MessageOutboxStatus): Promise<void> {
		await db.query('UPDATE messages_outbox SET sent_at = NOW(), status = $1 WHERE id = ANY($2);', [
			status,
			ids,
		]);
	}

	async cleanUpSentMessages(): Promise<void> {
		await db.query(
			"DELETE FROM messages_outbox WHERE status = 'sent' AND sent_at < NOW() - INTERVAL '1 hour';",
		);
	}
}

export const messagesOutboxRepository = new MessagesOutboxRepository();
