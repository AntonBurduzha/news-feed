import { PoolClient } from 'pg';
import { db } from '@/db/postgres';
import type { CreatePostInput, UpdatePostInput, PostRow } from './posts.types';
import { logger } from '@/lib/logger';

class PostRepository {
	async create(input: CreatePostInput, client?: PoolClient): Promise<PostRow> {
		const connection = client ?? db;
		const query =
			'INSERT INTO posts (user_id, content) VALUES ($1, $2) RETURNING id, user_id, content, created_at, updated_at;';
		const { rows } = await connection.query<PostRow>(query, [input.userId, input.content]);
		return rows[0];
	}

	async findAll(userId: number, limit: number | null, cursor: string | null): Promise<PostRow[]> {
		let query: string;
		let queryParams: [number, string, number, ...number[]] | [number, ...number[]];
		if (cursor) {
			const decodedCursor = Buffer.from(cursor, 'base64').toString('utf-8');
			const cursorObj = JSON.parse(decodedCursor) as { createdAt: string; id: number };
			query = `
				SELECT id, user_id, content, created_at, updated_at 
				FROM posts 
				WHERE (created_at, id) < ($2::timestamptz, $3) AND user_id = $1 
				ORDER BY created_at DESC, id DESC 
				${limit ? `LIMIT $4` : ''}
    	`;
			queryParams = [userId, cursorObj.createdAt, cursorObj.id, ...(limit ? [limit] : [])];
		} else {
			query = `
				SELECT id, user_id, content, created_at, updated_at 
				FROM posts 
				WHERE user_id = $1
				ORDER BY created_at DESC, id DESC 
				${limit ? `LIMIT $2` : ''}
    	`;
			queryParams = [userId, ...(limit ? [limit] : [])];
		}
		logger.info({ query, queryParams }, 'Getting posts');
		const { rows } = await db.query<PostRow>(query, queryParams);
		return rows;
	}

	async findById(id: number): Promise<PostRow | null> {
		const query = 'SELECT id, user_id, content, created_at, updated_at FROM posts WHERE id = $1;';
		const { rows } = await db.query<PostRow>(query, [id]);
		return rows[0] ?? null;
	}

	async update(id: number, input: UpdatePostInput): Promise<PostRow | null> {
		const query =
			'UPDATE posts SET content = $1 WHERE id = $2 RETURNING id, user_id, content, created_at, updated_at;';
		const { rows } = await db.query<PostRow>(query, [input.content, id]);
		return rows[0] ?? null;
	}

	async delete(id: number, client?: PoolClient): Promise<boolean> {
		const connection = client ?? db;
		const query = 'DELETE FROM posts WHERE id = $1;';
		const { rowCount } = await connection.query(query, [id]);
		return (rowCount ?? 0) > 0;
	}
}

export const postsRepository = new PostRepository();
