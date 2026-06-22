import { describe, test, expect, vi, beforeEach } from 'vitest';
import { authFixtures } from '../../fixtures/auth';

vi.mock('@/db/postgres', () => ({ db: { query: vi.fn() } }));

import { authRepository } from '@/modules/auth/auth.repository';
import { db } from '@/db/postgres';

describe('AuthRepository', () => {
	const dbMock = vi.mocked(db);
	const dbQuerySpy = vi.spyOn(dbMock, 'query');

	beforeEach(() => vi.clearAllMocks());

	test('createUser creates a new user', async () => {
		const { newUserInput } = authFixtures;
		const { email, password } = newUserInput.body;
		dbQuerySpy.mockResolvedValue({ rows: [{ id: 'user-1' }] });
		const result = await authRepository.createUser({ email, passwordHash: password });
		expect(dbQuerySpy).toHaveBeenCalledWith(
			'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id;',
			[email, password],
		);
		expect(result).toBe('user-1');
	});

	test('getUserByEmail returns a user by email', async () => {
		const { loginInput, user } = authFixtures;
		const { email } = loginInput.body;
		dbQuerySpy.mockResolvedValue({ rows: [{ id: user.user_id, password_hash: 'password' }] });
		const result = await authRepository.getUserByEmail(email);
		expect(dbQuerySpy).toHaveBeenCalledWith(
			'SELECT id, password_hash FROM users WHERE email = $1;',
			[email],
		);
		expect(result).toMatchObject({ id: user.user_id, password_hash: 'password' });
	});

	test('createRefreshToken creates a new refresh token', async () => {
		const { refreshTokenData, user } = authFixtures;
		const { tokenHash, expiresAt } = refreshTokenData;
		dbQuerySpy.mockResolvedValue({ rows: [{ id: 'refresh-token-1' }] });
		await authRepository.createRefreshToken({ userId: user.user_id, tokenHash, expiresAt });
		expect(dbQuerySpy).toHaveBeenCalledWith(
			'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id;',
			[user.user_id, tokenHash, expiresAt],
		);
	});

	test('getUserByRefreshToken returns a user by refresh token', async () => {
		const { refreshTokenData, user } = authFixtures;
		const { tokenHash } = refreshTokenData;
		dbQuerySpy.mockResolvedValue({ rows: [{ user_id: user.user_id }] });
		const result = await authRepository.getUserByRefreshToken(tokenHash);
		expect(dbQuerySpy).toHaveBeenCalledWith(
			'SELECT user_id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW();',
			[tokenHash],
		);
		expect(result).toMatchObject({ user_id: user.user_id });
	});
});
