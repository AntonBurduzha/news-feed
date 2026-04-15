import { PoolClient } from 'pg';
import { db } from '@/db/postgres';
import type { CreatePostInput, UpdatePostInput, PostRow } from './posts.types';
import { logger } from '@/lib/logger';

class PostRepository {
	async create(input: CreatePostInput, client?: PoolClient): Promise<PostRow> {
		const connection = client ?? db;
		const query =
			'INSERT INTO posts (user_id, content) VALUES ($1, $2) RETURNING id, user_id, content, likes_count, comments_count, created_at;';
		const { rows } = await connection.query<PostRow>(query, [input.userId, input.content]);
		return rows[0];
	}

	async findAll(limit: number = 10, cursor: string | null): Promise<PostRow[]> {
		let query: string;
		let queryParams: [string, number, number] | [number];
		if (cursor) {
			const decodedCursor = Buffer.from(cursor, 'base64').toString('utf-8');
			const cursorObj = JSON.parse(decodedCursor) as { createdAt: string; id: number };
			query = `
				SELECT id, user_id, content, created_at, likes_count, comments_count 
				FROM posts 
				WHERE (created_at, id) < ($1::timestamptz, $2)
				ORDER BY created_at DESC, id DESC 
				LIMIT $3
    	`;
			queryParams = [cursorObj.createdAt, cursorObj.id, limit];
		} else {
			query = `
				SELECT id, user_id, content, created_at, likes_count, comments_count 
				FROM posts 
				ORDER BY created_at DESC, id DESC 
				LIMIT $1
    	`;
			queryParams = [limit];
		}
		logger.info({ query, queryParams }, 'Getting posts');
		const { rows } = await db.query<PostRow>(query, queryParams);
		return rows;
	}

	async findById(id: number): Promise<PostRow | null> {
		const query =
			'SELECT id, user_id, content, likes_count, comments_count, created_at FROM posts WHERE id = $1;';
		const { rows } = await db.query<PostRow>(query, [id]);
		return rows[0] ?? null;
	}

	async update(id: number, input: UpdatePostInput): Promise<PostRow | null> {
		const query =
			'UPDATE posts SET content = $1 WHERE id = $2 RETURNING id, user_id, content, likes_count, comments_count, created_at;';
		const { rows } = await db.query<PostRow>(query, [input.content, id]);
		return rows[0] ?? null;
	}

	async delete(id: number): Promise<boolean> {
		const query = 'DELETE FROM posts WHERE id = $1;';
		const { rowCount } = await db.query(query, [id]);
		return (rowCount ?? 0) > 0;
	}
}

export const postsRepository = new PostRepository();
