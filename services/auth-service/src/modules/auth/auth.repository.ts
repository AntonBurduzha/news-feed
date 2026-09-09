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

	async createRefreshToken(
		input: CreateRefreshTokenInput & { familyId?: string },
	): Promise<string> {
		const query = `
			INSERT INTO refresh_tokens (user_id, token_hash, expires_at, family_id)
			VALUES ($1, $2, $3, COALESCE($4::uuid, gen_random_uuid()))
			RETURNING family_id;`;
		const { rows } = await db.query<{ family_id: string }>(query, [
			input.userId,
			input.tokenHash,
			input.expiresAt,
			input.familyId ?? null,
		]);
		return rows[0].family_id;
	}

	async findRefreshToken(tokenHash: string): Promise<RefreshTokenRow | undefined> {
		const { rows } = await db.query<RefreshTokenRow>(
			`SELECT id, user_id, token_hash, family_id, expires_at, used_at, revoked_at
			FROM refresh_tokens WHERE token_hash = $1;`,
			[tokenHash],
		);
		return rows[0];
	}

	async markRefreshTokenUsed(id: string): Promise<boolean> {
		const result = await db.query(
			'UPDATE refresh_tokens SET used_at = NOW(), updated_at = NOW() WHERE id = $1 AND used_at IS NULL;',
			[id],
		);
		return (result.rowCount ?? 0) === 1;
	}

	async revokeTokenFamily(familyId: string): Promise<number> {
		const result = await db.query(
			'UPDATE refresh_tokens SET revoked_at = NOW(), updated_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL;',
			[familyId],
		);
		return result.rowCount ?? 0;
	}

	async deleteExpiredTokens(): Promise<number> {
		const result = await db.query(
			"DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '30 days';",
		);
		return result.rowCount ?? 0;
	}
}

export const authRepository = new AuthRepository();
