import { db } from '@/db/postgres';
import type { CreateRefreshTokenInput, RefreshTokenRow, UserRow } from './auth.types';

class AuthRepository {
	async createUser(input: { email: string; passwordHash: string }): Promise<string> {
		const query = 'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id;';
		const { rows } = await db.query<UserRow>(query, [input.email, input.passwordHash]);
		return rows[0].id;
	}

	async getUserByEmail(email: string): Promise<{ id: string; password_hash: string }> {
		const query = 'SELECT id, password_hash FROM users WHERE email = $1;';
		const { rows } = await db.query<Pick<UserRow, 'id' | 'password_hash'>>(query, [email]);
		return rows[0];
	}

	async createRefreshToken(input: CreateRefreshTokenInput): Promise<void> {
		const query =
			'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id;';
		await db.query<RefreshTokenRow>(query, [input.userId, input.tokenHash, input.expiresAt]);
	}

	async getUserByRefreshToken(token: string): Promise<{ user_id: string }> {
		const query =
			'SELECT user_id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW();';
		const { rows } = await db.query<Pick<RefreshTokenRow, 'user_id'>>(query, [token]);
		return rows[0];
	}
}

export const authRepository = new AuthRepository();
