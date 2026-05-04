import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';
import { MessageOutboxStatus } from '@/modules/messages-outbox/messages-outbox.constants';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
	pgm.createTable('messages_outbox', {
		id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
		topic: { type: 'varchar(255)', notNull: true },
		payload: { type: 'jsonb', notNull: true },
		correlation_id: { type: 'varchar(255)', notNull: true },
		status: { type: 'varchar(20)', notNull: true, default: MessageOutboxStatus.Pending },
		sent_at: { type: 'timestamp with time zone' },
		retry_count: { type: 'integer', notNull: true, default: 0 },
		max_retries: { type: 'integer', notNull: true, default: 5 },
		created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
	});
}

export async function down(pgm: MigrationBuilder): Promise<void> {
	pgm.dropTable('messages_outbox', { ifExists: true });
}
