import { PoolClient } from 'pg';
import { db } from '@/db/postgres';
import type { CreatePostInput, UpdatePostInput, PostRow, CursorParams } from './posts.types';

class PostRepository {
	async create(input: CreatePostInput, client?: PoolClient): Promise<PostRow> {
		const connection = client ?? db;
		const query =
			'INSERT INTO posts (user_id, content) VALUES ($1, $2) RETURNING id, user_id, content, created_at, updated_at;';
		const { rows } = await connection.query<PostRow>(query, [input.userId, input.content]);
		return rows[0];
	}

	async findById(id: string): Promise<PostRow | null> {
		const query = 'SELECT id, user_id, content, created_at, updated_at FROM posts WHERE id = $1;';
		const { rows } = await db.query<PostRow>(query, [id]);
		return rows[0] ?? null;
	}

	async findByAuthors(ids: string[], limit: number, cursor: CursorParams): Promise<PostRow[]> {
		if (ids.length === 0) return [];
		const query = `
			SELECT id, user_id, content, created_at, updated_at FROM posts
			WHERE user_id = ANY($1)
				AND (
					$2::timestamptz IS NULL
					OR (created_at, id) < ($2::timestamptz, $3::uuid)
				)
			ORDER BY created_at DESC, id DESC
			LIMIT $4;`;
		const { rows } = await db.query<PostRow>(query, [ids, cursor.createdAt, cursor.id, limit]);
		return rows;
	}

	async update(id: string, input: UpdatePostInput): Promise<PostRow | null> {
		const query =
			'UPDATE posts SET content = $1 WHERE id = $2 RETURNING id, user_id, content, created_at, updated_at;';
		const { rows } = await db.query<PostRow>(query, [input.content, id]);
		return rows[0] ?? null;
	}

	async delete(id: string, client?: PoolClient): Promise<boolean> {
		const connection = client ?? db;
		const query = 'DELETE FROM posts WHERE id = $1;';
		const { rowCount } = await connection.query(query, [id]);
		return (rowCount ?? 0) > 0;
	}
}

export const postsRepository = new PostRepository();
