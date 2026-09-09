import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
	pgm.addColumns('refresh_tokens', {
		used_at: { type: 'timestamp with time zone' },
		family_id: { type: 'uuid', notNull: true, default: pgm.func('gen_random_uuid()') },
	});
	pgm.createIndex('refresh_tokens', ['token_hash'], {
		name: 'idx_refresh_tokens_hash',
		unique: true,
	});
	pgm.createIndex('refresh_tokens', ['family_id'], { name: 'idx_refresh_tokens_family' });
	pgm.createIndex('refresh_tokens', ['expires_at'], { name: 'idx_refresh_tokens_expires' });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
	pgm.dropIndex('refresh_tokens', [], { name: 'idx_refresh_tokens_expires', ifExists: true });
	pgm.dropIndex('refresh_tokens', [], { name: 'idx_refresh_tokens_family', ifExists: true });
	pgm.dropIndex('refresh_tokens', [], { name: 'idx_refresh_tokens_hash', ifExists: true });
	pgm.dropColumns('refresh_tokens', ['used_at', 'family_id']);
}
