import { db } from '@/db/postgres';
import type { FollowerPartitionRow } from './follower-partitions.types';

class FollowerPartitionsRepository {
	async findByFollowerId(followerId: string): Promise<FollowerPartitionRow | null> {
		const { rows } = await db.query<FollowerPartitionRow>(
			'SELECT follower_id, partition_index FROM follower_partitions WHERE follower_id = $1;',
			[followerId],
		);
		return rows[0] ?? null;
	}

	async findFollowerIdsWithoutPartition(): Promise<string[]> {
		const { rows } = await db.query<{ follower_id: string }>(
			`SELECT DISTINCT f.follower_id
			 FROM follows f
			 LEFT JOIN follower_partitions fp ON f.follower_id = fp.follower_id
			 WHERE fp.follower_id IS NULL;`,
		);
		return rows.map(r => r.follower_id);
	}

	async findUnassignedPartitionIndex(totalPartitions: number): Promise<number | null> {
		const { rows } = await db.query<{ idx: number }>(
			`SELECT idx
			 FROM generate_series(0, $1 - 1) AS idx
			 LEFT JOIN follower_partitions fp ON fp.partition_index = idx
			 WHERE fp.partition_index IS NULL
			 ORDER BY idx
			 LIMIT 1;`,
			[totalPartitions],
		);
		return rows[0]?.idx ?? null;
	}

	async create(followerId: string, partitionIndex: number): Promise<void> {
		await db.query(
			'INSERT INTO follower_partitions (follower_id, partition_index) VALUES ($1, $2);',
			[followerId, partitionIndex],
		);
	}

	async deleteByFollowerId(followerId: string): Promise<boolean> {
		const { rowCount } = await db.query('DELETE FROM follower_partitions WHERE follower_id = $1;', [
			followerId,
		]);
		return (rowCount ?? 0) > 0;
	}
}

export const followerPartitionsRepository = new FollowerPartitionsRepository();
