import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { authFixtures } from '../../fixtures/auth';

vi.mock('@/modules/auth/auth.service', () => ({
	authService: {
		register: vi.fn(),
		login: vi.fn(),
		refresh: vi.fn(),
	},
}));

import { authService } from '@/modules/auth/auth.service';
import { register, login, refresh } from '@/modules/auth/auth.controller';

describe('AuthController', () => {
	const authServiceMock = vi.mocked(authService);
	const registerSpy = vi.spyOn(authServiceMock, 'register');
	const loginSpy = vi.spyOn(authServiceMock, 'login');
	const refreshSpy = vi.spyOn(authServiceMock, 'refresh');
	const status = vi.fn().mockReturnThis();
	const json = vi.fn();
	const res = { status, json } as unknown as Response;

	beforeEach(() => vi.clearAllMocks());

	test('register calls authService.register with the correct input', async () => {
		const { newUserInput, newUserResult } = authFixtures;
		authServiceMock.register.mockResolvedValue(newUserResult);
		await register({ ...newUserInput } as unknown as Request, res);
		expect(registerSpy).toHaveBeenCalledWith(newUserInput);
		expect(status).toHaveBeenCalledWith(201);
		expect(json).toHaveBeenCalledWith({
			accessToken: newUserResult.accessToken,
			refreshToken: newUserResult.refreshToken,
			userId: newUserResult.userId,
		});
	});

	test('login calls authService.login with the correct input', async () => {
		const { loginInput, loginResult } = authFixtures;
		authServiceMock.login.mockResolvedValue(loginResult);
		await login(loginInput as unknown as Request, res);
		expect(loginSpy).toHaveBeenCalledWith(loginInput);
		expect(json).toHaveBeenCalledWith(loginResult);
	});

	test('refresh calls authService.refresh with the correct input', async () => {
		const { refreshInput, refreshResult } = authFixtures;
		authServiceMock.refresh.mockResolvedValue(refreshResult);
		await refresh(refreshInput as unknown as Request, res);
		expect(refreshSpy).toHaveBeenCalledWith(refreshInput);
		expect(json).toHaveBeenCalledWith(refreshResult);
	});
});
