import { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
	pgm.createIndex('follows', ['following_id', 'follower_id'], {
		name: 'idx_follows_following_id_follower_id',
	});
}

export async function down(pgm: MigrationBuilder): Promise<void> {
	pgm.dropIndex('follows', ['following_id', 'follower_id'], {
		name: 'idx_follows_following_id_follower_id',
		ifExists: true,
	});
}
