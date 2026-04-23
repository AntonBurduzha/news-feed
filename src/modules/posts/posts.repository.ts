import { PoolClient } from 'pg';
import { db } from '@/db/postgres';
import type { CreatePostInput, UpdatePostInput, PostRow } from './posts.types';

class PostRepository {
	async create(input: CreatePostInput, client?: PoolClient): Promise<PostRow> {
		const connection = client ?? db;
		const query =
			'INSERT INTO posts (user_id, content) VALUES ($1, $2) RETURNING id, user_id, content, created_at, updated_at;';
		const { rows } = await connection.query<PostRow>(query, [input.userId, input.content]);
		return rows[0];
	}

	async findAll(userId: string, limit: number | null, cursor: string | null): Promise<PostRow[]> {
		let query: string;
		let queryParams: [string, string, ...number[]] | [string, ...number[]];
		if (cursor) {
			const createdAt = Buffer.from(cursor, 'base64').toString('utf-8');
			query = `
				SELECT id, user_id, content, created_at, updated_at 
				FROM posts 
				WHERE created_at < $2 AND user_id = $1
				ORDER BY created_at DESC
				${limit ? `LIMIT $3` : ''}
    	`;
			queryParams = [userId, createdAt, ...(limit ? [limit] : [])];
		} else {
			query = `
				SELECT id, user_id, content, created_at, updated_at 
				FROM posts 
				WHERE user_id = $1
				ORDER BY created_at DESC
				${limit ? `LIMIT $2` : ''}
    	`;
			queryParams = [userId, ...(limit ? [limit] : [])];
		}
		const { rows } = await db.query<PostRow>(query, queryParams);
		return rows;
	}

	async findById(id: string): Promise<PostRow | null> {
		const query = 'SELECT id, user_id, content, created_at, updated_at FROM posts WHERE id = $1;';
		const { rows } = await db.query<PostRow>(query, [id]);
		return rows[0] ?? null;
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
