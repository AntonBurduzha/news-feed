import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
	pgm.addColumn('messages_outbox', {
		trace_id: { type: 'text', notNull: false },
	});
}

export async function down(pgm: MigrationBuilder): Promise<void> {
	pgm.dropColumn('messages_outbox', 'trace_id');
}
