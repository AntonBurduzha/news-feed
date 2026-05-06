import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
	pgm.createTable('follower_partitions', {
		id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
		follower_id: {
			type: 'uuid',
			notNull: true,
			references: 'users(id)',
			onDelete: 'CASCADE',
		},
		partition_index: { type: 'integer', notNull: true },
		created_at: { type: 'timestamp with time zone', notNull: true, default: pgm.func('now()') },
	});
	pgm.addConstraint('follower_partitions', 'unique_follower_partition', {
		unique: ['follower_id'],
	});
}

export async function down(pgm: MigrationBuilder): Promise<void> {
	pgm.dropTable('follower_partitions', { ifExists: true });
}
