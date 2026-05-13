import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
	pgm.addColumns('users', {
		password_hash: { type: 'varchar(255)', notNull: true },
	});
	pgm.createTable('refresh_tokens', {
		id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
		user_id: { type: 'uuid', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
		token_hash: { type: 'varchar(255)', notNull: true },
		expires_at: { type: 'timestamp with time zone', notNull: true },
		revoked_at: { type: 'timestamp with time zone' },
		created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
		updated_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
	});
}

export async function down(pgm: MigrationBuilder): Promise<void> {
	pgm.dropColumns('users', ['password_hash']);
	pgm.dropTable('refresh_tokens', { ifExists: true });
}
