import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
	pgm.addColumns('messages_outbox', {
		claimed_at: { type: 'timestamp with time zone' },
	});
	pgm.createIndex('messages_outbox', ['created_at'], {
		name: 'idx_outbox_pending',
		where: "status = 'pending'",
	});
	pgm.createIndex('messages_outbox', ['claimed_at'], {
		name: 'idx_outbox_claimed',
		where: "status = 'claimed'",
	});
}

export async function down(pgm: MigrationBuilder): Promise<void> {
	pgm.dropIndex('messages_outbox', [], { name: 'idx_outbox_claimed', ifExists: true });
	pgm.dropIndex('messages_outbox', [], { name: 'idx_outbox_pending', ifExists: true });
	pgm.dropColumns('messages_outbox', ['claimed_at']);
}
