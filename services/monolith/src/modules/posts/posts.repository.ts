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

	private buildListFilter(
		userId: string,
		cursor: string | null,
	): { whereClause: string; params: [string] | [string, string] } {
		if (cursor) {
			const createdAt = Buffer.from(cursor, 'base64').toString('utf-8');
			return {
				whereClause: 'WHERE user_id = $1 AND created_at < $2',
				params: [userId, createdAt],
			};
		}
		return {
			whereClause: 'WHERE user_id = $1',
			params: [userId],
		};
	}

	async findAll(
		userId: string,
		limit: number | null,
		cursor: string | null,
	): Promise<{ posts: PostRow[]; totalCount: number }> {
		const { whereClause, params } = this.buildListFilter(userId, cursor);
		const postsQuery = `
			SELECT id, user_id, content, created_at, updated_at
			FROM posts
			${whereClause}
			ORDER BY created_at DESC
			${limit ? `LIMIT $${params.length + 1}` : ''}
		`;
		const postsParams = limit ? [...params, limit] : params;
		const countQuery = `
			SELECT COUNT(*)::int AS total_count
			FROM posts
			${whereClause}
		`;
		const [postsResult, countResult] = await Promise.all([
			db.query<PostRow>(postsQuery, postsParams),
			db.query<{ total_count: number }>(countQuery, params),
		]);
		return {
			posts: postsResult.rows,
			totalCount: countResult.rows[0]?.total_count ?? 0,
		};
	}

	async findById(id: string): Promise<PostRow | null> {
		const query = 'SELECT id, user_id, content, created_at, updated_at FROM posts WHERE id = $1;';
		const { rows } = await db.query<PostRow>(query, [id]);
		return rows[0] ?? null;
	}

	async findLatestByAuthors(ids: string[]): Promise<PostRow[]> {
		if (ids.length === 0) {
			return [];
		}
		const query = `
			SELECT id, user_id, content, created_at, updated_at FROM posts
			WHERE user_id = ANY($1)
			ORDER BY created_at DESC
			LIMIT 20;`;
		const { rows } = await db.query<PostRow>(query, [ids]);
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
