import { describe, test, expect, vi, beforeEach, Mock } from 'vitest';
import { DatabaseError } from 'pg';
import { authFixtures } from '../../fixtures/auth';

vi.mock('@/modules/auth/auth.repository', () => ({
	authRepository: {
		createUser: vi.fn(),
		createRefreshToken: vi.fn(),
		getUserByEmail: vi.fn(),
		getUserByRefreshToken: vi.fn(),
	},
}));
vi.mock('@/lib/tokens', () => ({
	ACCESS_TOKEN_TTL_SEC: 300,
	hashPassword: vi.fn().mockResolvedValue(authFixtures.hashedPassword),
	signAccessToken: vi.fn().mockResolvedValue(authFixtures.accessToken),
	generateRefreshToken: vi.fn(),
	hashRefreshToken: vi.fn(),
}));
vi.mock('@/db/redis', () => ({ cacheToken: vi.fn() }));
vi.mock('bcrypt', async importOriginal => {
	const actual = await importOriginal<typeof import('bcrypt')>();
	return { ...actual, compare: vi.fn() };
});

import { authRepository } from '@/modules/auth/auth.repository';
import { authService } from '@/modules/auth/auth.service';
import {
	hashPassword,
	signAccessToken,
	generateRefreshToken,
	ACCESS_TOKEN_TTL_SEC,
	hashRefreshToken,
} from '@/lib/tokens';
import { cacheToken } from '@/db/redis';
import bcrypt from 'bcrypt';

describe('AuthService', () => {
	const authRepositoryMock = vi.mocked(authRepository);
	const setCreateUserSpy = vi.spyOn(authRepositoryMock, 'createUser');
	const setCreateRefreshTokenSpy = vi.spyOn(authRepositoryMock, 'createRefreshToken');
	const getUserByRefreshTokenSpy = vi.spyOn(authRepositoryMock, 'getUserByRefreshToken');
	const getUserByEmailSpy = vi.spyOn(authRepositoryMock, 'getUserByEmail');

	const cacheTokenMock = vi.mocked(cacheToken);
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
		expect(cacheTokenMock).toHaveBeenCalledWith(
			refreshTokenData.raw,
			user.user_id,
			ACCESS_TOKEN_TTL_SEC,
		);
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

	test('refresh access token on success', async () => {
		const { refreshInput, user, accessToken } = authFixtures;
		getUserByRefreshTokenSpy.mockResolvedValue(user);
		const result = await authService.refresh(refreshInput);
		expect(hashRefreshTokenMock).toHaveBeenCalledWith(refreshInput.body.refreshToken);
		expect(signAccessTokenMock).toHaveBeenCalledWith(user.user_id);
		expect(cacheTokenMock).toHaveBeenCalledWith(accessToken, user.user_id, ACCESS_TOKEN_TTL_SEC);
		expect(result).toMatchObject({ accessToken });
	});

	test('throws AppError when trying to refresh with invalid refresh token', async () => {
		const { refreshInput } = authFixtures;
		getUserByRefreshTokenSpy.mockResolvedValue(null as unknown as { user_id: string });
		await expect(authService.refresh(refreshInput)).rejects.toThrow('Invalid refresh token');
		expect(hashRefreshTokenMock).toHaveBeenCalledWith(refreshInput.body.refreshToken);
		expect(signAccessTokenMock).not.toHaveBeenCalled();
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
		expect(cacheTokenMock).toHaveBeenCalledWith(
			refreshTokenData.raw,
			user.user_id,
			ACCESS_TOKEN_TTL_SEC,
		);
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
