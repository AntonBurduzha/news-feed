import { db } from '@/db/postgres';
import type { CreateFollowInput, FollowRow } from './follow.types';

class FollowsRepository {
	async create(input: CreateFollowInput): Promise<FollowRow> {
		const query = `INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) 
									RETURNING id, follower_id, following_id, created_at;`;
		const { rows } = await db.query<FollowRow>(query, [input.followerId, input.followingId]);
		return rows[0];
	}

	async findFollowersByFollowingId(followingId: number): Promise<number[]> {
		const query = 'SELECT array_agg(follower_id) AS ids FROM follows WHERE following_id = $1;';
		const { rows } = await db.query<{ ids: number[] }>(query, [followingId]);
		return rows[0].ids ?? [];
	}

	async findById(id: number): Promise<FollowRow | null> {
		const { rows } = await db.query<FollowRow>(
			'SELECT id, follower_id, following_id, created_at FROM follows WHERE id = $1;',
			[id],
		);
		return rows[0] ?? null;
	}

	async countByFollowerId(followerId: number): Promise<number> {
		const { rows } = await db.query<{ count: number }>(
			'SELECT count(*) AS count FROM follows WHERE follower_id = $1;',
			[followerId],
		);
		return rows[0].count;
	}

	async delete(id: number): Promise<boolean> {
		const query = 'DELETE FROM follows WHERE id = $1;';
		const { rowCount } = await db.query(query, [id]);
		return (rowCount ?? 0) > 0;
	}
}

export const followsRepository = new FollowsRepository();
