import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
	pgm.createTable('messages_outbox', {
		id: 'id',
		topic: { type: 'varchar(255)', notNull: true },
		payload: { type: 'jsonb', notNull: true },
		status: { type: 'varchar(20)', notNull: true, default: 'pending' },
		sent_at: { type: 'timestamp with time zone' },
		retry_count: { type: 'integer', notNull: true, default: 0 },
		max_retries: { type: 'integer', notNull: true, default: 5 },
		created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
	});
	pgm.createIndex('messages_outbox', 'status', {
		where: "status = 'pending'",
		name: 'idx_messages_outbox_pending',
	});
}

export async function down(pgm: MigrationBuilder): Promise<void> {
	pgm.dropTable('messages_outbox', { ifExists: true });
	pgm.dropIndex('messages_outbox', 'status', {
		name: 'idx_messages_outbox_pending',
		ifExists: true,
	});
}
