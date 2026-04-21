import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export const up = (pgm: MigrationBuilder): void => {
	pgm.createTable('users', {
		id: 'id',
		name: { type: 'varchar(255)' },
		email: { type: 'varchar(255)', notNull: true, unique: true },
		avatar_url: { type: 'varchar(255)' },
		created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
		updated_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
	});
	pgm.createTable('posts', {
		id: 'id',
		user_id: {
			type: 'integer',
			notNull: true,
			references: 'users(id)',
			onDelete: 'CASCADE',
		},
		content: { type: 'text', notNull: true },
		created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
		updated_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
	});
	pgm.createIndex(
		'posts',
		[{ name: 'user_id' }, { name: 'created_at', sort: 'DESC' }, { name: 'id', sort: 'DESC' }],
		{ name: 'idx_posts_user_id_created_at_id' },
	);
};

export const down = (pgm: MigrationBuilder): void => {
	pgm.dropIndex('posts', ['user_id', 'created_at', 'id'], {
		name: 'idx_posts_user_id_created_at_id',
		ifExists: true,
	});
	pgm.dropTable('posts', { ifExists: true });
	pgm.dropTable('users', { ifExists: true });
};
