import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export const up = (pgm: MigrationBuilder): void => {
	pgm.createTable('users', {
		id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
		name: { type: 'varchar(255)' },
		email: { type: 'varchar(255)', notNull: true, unique: true },
		avatar_url: { type: 'varchar(255)' },
		created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
		updated_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
	});
	pgm.createTable('posts', {
		id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
		user_id: {
			type: 'uuid',
			notNull: true,
			references: 'users(id)',
			onDelete: 'CASCADE',
		},
		content: { type: 'text', notNull: true },
		created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
		updated_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
	});
};

export const down = (pgm: MigrationBuilder): void => {
	pgm.dropTable('posts', { ifExists: true });
	pgm.dropTable('users', { ifExists: true });
};
