import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
	pgm.createTable('follows', {
		id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
		follower_id: {
			type: 'uuid',
			notNull: true,
			references: 'users(id)',
			onDelete: 'CASCADE',
		},
		following_id: {
			type: 'uuid',
			notNull: true,
			references: 'users(id)',
			onDelete: 'CASCADE',
		},
		created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
	});
	pgm.addConstraint('follows', 'unique_follower_following', {
		unique: ['follower_id', 'following_id'],
	});
}

export async function down(pgm: MigrationBuilder): Promise<void> {
	pgm.dropTable('follows', { ifExists: true });
}
