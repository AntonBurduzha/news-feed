import { describe, test, expect, vi, beforeEach, Mock } from 'vitest';
import { DatabaseError } from 'pg';
import httpStatus from 'http-status';
import { authFixtures } from '../../fixtures/auth';

vi.mock('@/modules/auth/auth.repository', () => ({
	authRepository: {
		createUser: vi.fn(),
		createRefreshToken: vi.fn(),
		getUserByEmail: vi.fn(),
		findRefreshToken: vi.fn(),
		markRefreshTokenUsed: vi.fn(),
		revokeTokenFamily: vi.fn(),
		deleteExpiredTokens: vi.fn(),
	},
}));
vi.mock('@/lib/tokens', () => ({
	ACCESS_TOKEN_TTL_SEC: 300,
	hashPassword: vi.fn().mockResolvedValue(authFixtures.hashedPassword),
	signAccessToken: vi.fn().mockResolvedValue(authFixtures.accessToken),
	generateRefreshToken: vi.fn(),
	hashRefreshToken: vi.fn(),
}));
vi.mock('bcrypt', async importOriginal => {
	const actual = await importOriginal<typeof import('bcrypt')>();
	return { ...actual, compare: vi.fn() };
});

import { authRepository } from '@/modules/auth/auth.repository';
import { authService } from '@/modules/auth/auth.service';
import { AppError } from '@/lib/errors';
import {
	hashPassword,
	signAccessToken,
	generateRefreshToken,
	hashRefreshToken,
} from '@/lib/tokens';
import bcrypt from 'bcrypt';

describe('AuthService', () => {
	const authRepositoryMock = vi.mocked(authRepository);
	const setCreateUserSpy = vi.spyOn(authRepositoryMock, 'createUser');
	const setCreateRefreshTokenSpy = vi.spyOn(authRepositoryMock, 'createRefreshToken');
	const getUserByEmailSpy = vi.spyOn(authRepositoryMock, 'getUserByEmail');
	const findRefreshTokenSpy = vi.spyOn(authRepositoryMock, 'findRefreshToken');
	const markRefreshTokenUsedSpy = vi.spyOn(authRepositoryMock, 'markRefreshTokenUsed');
	const revokeTokenFamilySpy = vi.spyOn(authRepositoryMock, 'revokeTokenFamily');
	const deleteExpiredTokensSpy = vi.spyOn(authRepositoryMock, 'deleteExpiredTokens');

	const generateRefreshTokenMock = vi.mocked(generateRefreshToken);
	const signAccessTokenMock = vi.mocked(signAccessToken);
	const hashPasswordMock = vi.mocked(hashPassword);
	const hashRefreshTokenMock = vi.mocked(hashRefreshToken);
	const compareMock = vi.spyOn(bcrypt, 'compare') as unknown as Mock<
		(data: string, encrypted: string) => Promise<boolean>
	>;
	const duplicateDbError = new DatabaseError('duplicate key', 0, 'error');
	(duplicateDbError as { code: string }).code = '23505';

	beforeEach(() => vi.clearAllMocks());

	test('register new user and issues tokens on success', async () => {
		const { newUserInput, user, refreshTokenData, hashedPassword, accessToken } = authFixtures;
		generateRefreshTokenMock.mockResolvedValue(refreshTokenData);
		setCreateUserSpy.mockResolvedValue(user.user_id);

		const result = await authService.register(newUserInput);
		expect(hashPasswordMock).toHaveBeenCalledWith(newUserInput.body.password);
		expect(setCreateUserSpy).toHaveBeenCalledWith({
			email: newUserInput.body.email,
			passwordHash: hashedPassword,
		});
		expect(signAccessTokenMock).toHaveBeenCalledWith(user.user_id);
		expect(generateRefreshTokenMock).toHaveBeenCalled();
		expect(setCreateRefreshTokenSpy).toHaveBeenCalledWith({
			userId: user.user_id,
			tokenHash: refreshTokenData.tokenHash,
			expiresAt: refreshTokenData.expiresAt,
		});
		expect(result).toMatchObject({
			accessToken,
			refreshToken: refreshTokenData.raw,
			userId: user.user_id,
		});
	});

	test('throws ConflictError when trying to register with duplicate email', async () => {
		const { newUserInput } = authFixtures;
		setCreateUserSpy.mockRejectedValue(duplicateDbError);
		await expect(authService.register(newUserInput)).rejects.toThrow('Email already registered');
		expect(signAccessTokenMock).not.toHaveBeenCalled();
	});

	describe('refresh', () => {
		const { refreshInput, refreshTokenData, rotatedRefreshTokenData, accessToken } = authFixtures;

		beforeEach(() => {
			hashRefreshTokenMock.mockReturnValue(refreshTokenData.tokenHash);
			generateRefreshTokenMock.mockResolvedValue(rotatedRefreshTokenData);
		});

		test('rotates the refresh token within the same family on success', async () => {
			const row = authFixtures.makeRefreshTokenRow();
			findRefreshTokenSpy.mockResolvedValue(row);
			markRefreshTokenUsedSpy.mockResolvedValue(true);

			const result = await authService.refresh(refreshInput);

			expect(hashRefreshTokenMock).toHaveBeenCalledWith(refreshInput.body.refreshToken);
			expect(findRefreshTokenSpy).toHaveBeenCalledWith(refreshTokenData.tokenHash);
			expect(markRefreshTokenUsedSpy).toHaveBeenCalledWith(row.id);
			expect(setCreateRefreshTokenSpy).toHaveBeenCalledWith({
				userId: row.user_id,
				tokenHash: rotatedRefreshTokenData.tokenHash,
				expiresAt: rotatedRefreshTokenData.expiresAt,
				familyId: row.family_id,
			});
			expect(signAccessTokenMock).toHaveBeenCalledWith(row.user_id);
			expect(revokeTokenFamilySpy).not.toHaveBeenCalled();
			expect(result).toEqual({ accessToken, refreshToken: rotatedRefreshTokenData.raw });
		});

		test('throws AppError when trying to refresh with an unknown refresh token', async () => {
			findRefreshTokenSpy.mockResolvedValue(undefined);

			await expect(authService.refresh(refreshInput)).rejects.toThrow('Invalid refresh token');
			expect(hashRefreshTokenMock).toHaveBeenCalledWith(refreshInput.body.refreshToken);
			expect(signAccessTokenMock).not.toHaveBeenCalled();
			expect(setCreateRefreshTokenSpy).not.toHaveBeenCalled();
		});

		test('revokes the whole family when an already-used refresh token is replayed', async () => {
			const row = authFixtures.makeRefreshTokenRow({ used_at: new Date() });
			findRefreshTokenSpy.mockResolvedValue(row);
			revokeTokenFamilySpy.mockResolvedValue(2);

			await expect(authService.refresh(refreshInput)).rejects.toThrow('Invalid refresh token');
			expect(revokeTokenFamilySpy).toHaveBeenCalledWith(row.family_id);
			expect(markRefreshTokenUsedSpy).not.toHaveBeenCalled();
			expect(signAccessTokenMock).not.toHaveBeenCalled();
			expect(setCreateRefreshTokenSpy).not.toHaveBeenCalled();
		});

		test('throws AppError when the refresh token was revoked', async () => {
			findRefreshTokenSpy.mockResolvedValue(
				authFixtures.makeRefreshTokenRow({ revoked_at: new Date() }),
			);

			await expect(authService.refresh(refreshInput)).rejects.toMatchObject({
				message: 'Invalid refresh token',
				statusCode: httpStatus.UNAUTHORIZED,
			});
			expect(markRefreshTokenUsedSpy).not.toHaveBeenCalled();
			expect(signAccessTokenMock).not.toHaveBeenCalled();
		});

		test('throws AppError when the refresh token has expired', async () => {
			findRefreshTokenSpy.mockResolvedValue(
				authFixtures.makeRefreshTokenRow({ expires_at: new Date(Date.now() - 1_000) }),
			);

			await expect(authService.refresh(refreshInput)).rejects.toThrow('Invalid refresh token');
			expect(markRefreshTokenUsedSpy).not.toHaveBeenCalled();
			expect(signAccessTokenMock).not.toHaveBeenCalled();
		});

		test('revokes the family when the token is claimed concurrently', async () => {
			const row = authFixtures.makeRefreshTokenRow();
			findRefreshTokenSpy.mockResolvedValue(row);
			markRefreshTokenUsedSpy.mockResolvedValue(false);
			revokeTokenFamilySpy.mockResolvedValue(1);

			await expect(authService.refresh(refreshInput)).rejects.toThrow('Invalid refresh token');
			expect(revokeTokenFamilySpy).toHaveBeenCalledWith(row.family_id);
			expect(signAccessTokenMock).not.toHaveBeenCalled();
			expect(setCreateRefreshTokenSpy).not.toHaveBeenCalled();
		});
	});

	describe('logout', () => {
		test('revokes the token family of the presented refresh token', async () => {
			const { refreshInput, refreshTokenData } = authFixtures;
			const row = authFixtures.makeRefreshTokenRow();
			hashRefreshTokenMock.mockReturnValue(refreshTokenData.tokenHash);
			findRefreshTokenSpy.mockResolvedValue(row);
			revokeTokenFamilySpy.mockResolvedValue(1);

			await authService.logout(refreshInput.body.refreshToken);

			expect(hashRefreshTokenMock).toHaveBeenCalledWith(refreshInput.body.refreshToken);
			expect(findRefreshTokenSpy).toHaveBeenCalledWith(refreshTokenData.tokenHash);
			expect(revokeTokenFamilySpy).toHaveBeenCalledWith(row.family_id);
		});

		test('is a no-op for an unknown refresh token', async () => {
			findRefreshTokenSpy.mockResolvedValue(undefined);

			await expect(authService.logout('nope')).resolves.toBeUndefined();
			expect(revokeTokenFamilySpy).not.toHaveBeenCalled();
		});
	});

	describe('deleteExpiredTokens', () => {
		test('returns the number of rows the repository removed', async () => {
			deleteExpiredTokensSpy.mockResolvedValue(7);
			await expect(authService.deleteExpiredTokens()).resolves.toBe(7);
		});

		test('wraps repository failures in an AppError', async () => {
			deleteExpiredTokensSpy.mockRejectedValue(new Error('connection terminated'));
			await expect(authService.deleteExpiredTokens()).rejects.toThrowError(
				new AppError('Failed to delete expired tokens', httpStatus.INTERNAL_SERVER_ERROR),
			);
		});
	});

	test('returns access and refresh tokens on success', async () => {
		const { loginInput, user, refreshTokenData, hashedPassword, accessToken } = authFixtures;

		getUserByEmailSpy.mockResolvedValue({
			id: user.user_id,
			password_hash: hashedPassword,
		} as unknown as { id: string; password_hash: string });
		compareMock.mockResolvedValue(true);
		generateRefreshTokenMock.mockResolvedValue(refreshTokenData);

		const result = await authService.login(loginInput);

		expect(getUserByEmailSpy).toHaveBeenCalledWith(loginInput.body.email);
		expect(compareMock).toHaveBeenCalledWith(loginInput.body.password, hashedPassword);
		expect(signAccessTokenMock).toHaveBeenCalledWith(user.user_id);
		expect(generateRefreshTokenMock).toHaveBeenCalled();
		expect(setCreateRefreshTokenSpy).toHaveBeenCalledWith({
			userId: user.user_id,
			tokenHash: refreshTokenData.tokenHash,
			expiresAt: refreshTokenData.expiresAt,
		});
		expect(result).toMatchObject({ accessToken, refreshToken: refreshTokenData.raw });
	});

	test('throws AppError when trying to login with invalid email', async () => {
		const { loginInput } = authFixtures;
		getUserByEmailSpy.mockResolvedValue(null as unknown as { id: string; password_hash: string });
		await expect(authService.login(loginInput)).rejects.toThrow('Invalid credentials');
		expect(getUserByEmailSpy).toHaveBeenCalledWith(loginInput.body.email);
		expect(signAccessTokenMock).not.toHaveBeenCalled();
	});

	test('throws AppError when trying to login with invalid password', async () => {
		const { loginInput, user, hashedPassword } = authFixtures;
		getUserByEmailSpy.mockResolvedValue({
			id: user.user_id,
			password_hash: hashedPassword,
		} as unknown as { id: string; password_hash: string });
		compareMock.mockResolvedValue(false);
		await expect(authService.login(loginInput)).rejects.toThrow('Invalid credentials');
		expect(getUserByEmailSpy).toHaveBeenCalledWith(loginInput.body.email);
		expect(compareMock).toHaveBeenCalledWith(loginInput.body.password, hashedPassword);
		expect(signAccessTokenMock).not.toHaveBeenCalled();
	});
});
