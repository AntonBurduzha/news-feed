import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
	pgm.createTable('messages_outbox', {
		id: { type: 'bigserial', primaryKey: true },
		topic: { type: 'varchar(255)', notNull: true },
		payload: { type: 'jsonb', notNull: true },
		status: { type: 'varchar(20)', notNull: true, default: 'pending' },
		created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
		sent_at: { type: 'timestamp' },
		retry_count: { type: 'integer', notNull: true, default: 0 },
		max_retries: { type: 'integer', notNull: true, default: 5 },
	});
	pgm.createIndex('messages_outbox', 'status', {
		where: "status = 'pending'",
	});
}

export async function down(pgm: MigrationBuilder): Promise<void> {
	pgm.dropTable('messages_outbox', { ifExists: true });
	pgm.dropIndex('messages_outbox', 'idx_outbox_pending', { ifExists: true });
}
