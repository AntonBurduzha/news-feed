import { PoolClient } from 'pg';
import { db } from '@/db/postgres';
import type { CreateUserInput, UpdateUserInput, UserRow } from './users.types';

class UserRepository {
	async create(input: CreateUserInput): Promise<UserRow> {
		const query = 'INSERT INTO users (email) VALUES ($1) RETURNING id, email, created_at;';
		const { rows } = await db.query<UserRow>(query, [input.email]);
		return rows[0];
	}

	async findAll(): Promise<UserRow[]> {
		const query = 'SELECT id, name, email, avatar_url, created_at FROM users ORDER BY id;';
		const { rows } = await db.query<UserRow>(query);
		return rows;
	}

	async findById(id: string): Promise<UserRow | null> {
		const query = 'SELECT id, name, email, avatar_url, created_at FROM users WHERE id = $1;';
		const { rows } = await db.query<UserRow>(query, [id]);
		return rows[0] ?? null;
	}

	async update(id: string, input: UpdateUserInput): Promise<UserRow | null> {
		const query =
			'UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING id, name, email, avatar_url, created_at;';
		const { rows } = await db.query<UserRow>(query, [input.name, input.email, id]);
		return rows[0] ?? null;
	}

	async updateAvatar(id: string, avatarUrl: string): Promise<string> {
		const query = 'UPDATE users SET avatar_url = $1 WHERE id = $2 RETURNING avatar_url;';
		const { rows } = await db.query<{ avatar_url: string }>(query, [avatarUrl, id]);
		return rows[0].avatar_url;
	}

	async delete(id: string, client: PoolClient): Promise<boolean> {
		const connection = client ?? db;
		const query = 'DELETE FROM users WHERE id = $1;';
		const { rowCount } = await connection.query(query, [id]);
		return (rowCount ?? 0) > 0;
	}
}

export const usersRepository = new UserRepository();
