import { describe, test, expect, vi, beforeEach } from 'vitest';
import { authFixtures } from '../../fixtures/auth';

vi.mock('@/db/postgres', () => ({ db: { query: vi.fn() } }));

import { authRepository } from '@/modules/auth/auth.repository';
import { db } from '@/db/postgres';

describe('AuthRepository', () => {
	const dbMock = vi.mocked(db);
	const dbQuerySpy = vi.spyOn(dbMock, 'query');

	const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim();

	function expectQuery(sql: string, params?: unknown[]): void {
		expect(dbQuerySpy).toHaveBeenCalledTimes(1);
		const [actualSql, actualParams] = dbQuerySpy.mock.calls[0] as unknown as [
			string,
			unknown[] | undefined,
		];
		expect(normalize(actualSql)).toBe(normalize(sql));
		expect(actualParams).toEqual(params);
	}

	beforeEach(() => vi.clearAllMocks());

	test('createUser creates a new user', async () => {
		const { newUserInput } = authFixtures;
		const { email, password } = newUserInput.body;
		dbQuerySpy.mockResolvedValue({ rows: [{ id: 'user-1' }] });
		const result = await authRepository.createUser({ email, passwordHash: password });
		expectQuery('INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id;', [
			email,
			password,
		]);
		expect(result).toBe('user-1');
	});

	test('getUserByEmail returns a user by email', async () => {
		const { loginInput, user } = authFixtures;
		const { email } = loginInput.body;
		dbQuerySpy.mockResolvedValue({ rows: [{ id: user.user_id, password_hash: 'password' }] });
		const result = await authRepository.getUserByEmail(email);
		expectQuery('SELECT id, password_hash FROM users WHERE email = $1;', [email]);
		expect(result).toMatchObject({ id: user.user_id, password_hash: 'password' });
	});

	test('createRefreshToken starts a new family and returns its id', async () => {
		const { refreshTokenData, user, familyId } = authFixtures;
		const { tokenHash, expiresAt } = refreshTokenData;
		dbQuerySpy.mockResolvedValue({ rows: [{ family_id: familyId }] });

		const result = await authRepository.createRefreshToken({
			userId: user.user_id,
			tokenHash,
			expiresAt,
		});

		expectQuery(
			`INSERT INTO refresh_tokens (user_id, token_hash, expires_at, family_id)
			VALUES ($1, $2, $3, COALESCE($4::uuid, gen_random_uuid()))
			RETURNING family_id;`,
			[user.user_id, tokenHash, expiresAt, null],
		);
		expect(result).toBe(familyId);
	});

	test('createRefreshToken keeps the existing family when rotating', async () => {
		const { refreshTokenData, user, familyId } = authFixtures;
		const { tokenHash, expiresAt } = refreshTokenData;
		dbQuerySpy.mockResolvedValue({ rows: [{ family_id: familyId }] });

		const result = await authRepository.createRefreshToken({
			userId: user.user_id,
			tokenHash,
			expiresAt,
			familyId,
		});

		expect(dbQuerySpy.mock.calls[0][1]).toEqual([user.user_id, tokenHash, expiresAt, familyId]);
		expect(result).toBe(familyId);
	});

	test('findRefreshToken returns the row regardless of its state', async () => {
		const { refreshTokenData, makeRefreshTokenRow } = authFixtures;
		const row = makeRefreshTokenRow({ used_at: new Date() });
		dbQuerySpy.mockResolvedValue({ rows: [row] });

		const result = await authRepository.findRefreshToken(refreshTokenData.tokenHash);

		expectQuery(
			`SELECT id, user_id, token_hash, family_id, expires_at, used_at, revoked_at
			FROM refresh_tokens WHERE token_hash = $1;`,
			[refreshTokenData.tokenHash],
		);
		expect(result).toBe(row);
	});

	test('findRefreshToken returns undefined when no row matches', async () => {
		dbQuerySpy.mockResolvedValue({ rows: [] });
		await expect(authRepository.findRefreshToken('missing')).resolves.toBeUndefined();
	});

	test('markRefreshTokenUsed claims an unused token exactly once', async () => {
		dbQuerySpy.mockResolvedValue({ rows: [], rowCount: 1 });

		const result = await authRepository.markRefreshTokenUsed('refresh-token-1');

		expectQuery(
			'UPDATE refresh_tokens SET used_at = NOW(), updated_at = NOW() WHERE id = $1 AND used_at IS NULL;',
			['refresh-token-1'],
		);
		expect(result).toBe(true);
	});

	test('markRefreshTokenUsed returns false when the token was already claimed', async () => {
		dbQuerySpy.mockResolvedValue({ rows: [], rowCount: 0 });
		await expect(authRepository.markRefreshTokenUsed('refresh-token-1')).resolves.toBe(false);
	});

	test('revokeTokenFamily revokes every live token in the family', async () => {
		const { familyId } = authFixtures;
		dbQuerySpy.mockResolvedValue({ rows: [], rowCount: 3 });

		const result = await authRepository.revokeTokenFamily(familyId);

		expectQuery(
			'UPDATE refresh_tokens SET revoked_at = NOW(), updated_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL;',
			[familyId],
		);
		expect(result).toBe(3);
	});

	test('deleteExpiredTokens removes tokens past the retention window', async () => {
		dbQuerySpy.mockResolvedValue({ rows: [], rowCount: 12 });

		const result = await authRepository.deleteExpiredTokens();

		expectQuery("DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '30 days';");
		expect(result).toBe(12);
	});

	test('deleteExpiredTokens reports zero when rowCount is null', async () => {
		dbQuerySpy.mockResolvedValue({ rows: [], rowCount: null });
		await expect(authRepository.deleteExpiredTokens()).resolves.toBe(0);
	});
});
