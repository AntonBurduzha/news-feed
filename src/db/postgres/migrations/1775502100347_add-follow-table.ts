import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
	pgm.createTable('follows', {
		id: 'id',
		follower_id: {
			type: 'integer',
			notNull: true,
			references: 'users(id)',
			onDelete: 'CASCADE',
		},
		following_id: {
			type: 'integer',
			notNull: true,
			references: 'users(id)',
			onDelete: 'CASCADE',
		},
		created_at: {
			type: 'timestamp',
			notNull: true,
			default: pgm.func('now()'),
		},
	});
	pgm.addConstraint('follows', 'unique_follower_following', {
		unique: ['follower_id', 'following_id'],
	});
	pgm.createIndex('follows', 'follower_id');
	pgm.createIndex('follows', 'following_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
	pgm.dropTable('follows', { ifExists: true });
	pgm.dropIndex('follows', 'follower_id', { ifExists: true });
	pgm.dropIndex('follows', 'following_id', { ifExists: true });
}
