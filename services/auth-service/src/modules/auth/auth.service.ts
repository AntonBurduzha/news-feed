import { DatabaseError } from 'pg';
import httpStatus from 'http-status';
import bcrypt from 'bcrypt';
import { env } from '@/config/env';
import { AppError, ConflictError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { authFailuresTotal, authTokensIssuedTotal } from '@/lib/metrics';
import { cacheToken } from '@/db/redis';
import {
	hashRefreshToken,
	hashPassword,
	generateRefreshToken,
	signAccessToken,
	ACCESS_TOKEN_TTL_SEC,
} from '@/lib/tokens';
import { authRepository } from './auth.repository';
import type { LoginRequest, RegisterRequest, RefreshRequest } from './auth.types';

class AuthService {
	private readonly authRepository;
	constructor() {
		this.authRepository = authRepository;
	}

	async register(
		input: RegisterRequest,
	): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
		const passwordHash = await hashPassword(input.body.password);
		let userId: string;
		try {
			userId = await this.authRepository.createUser({ email: input.body.email, passwordHash });
		} catch (error) {
			if (error instanceof DatabaseError && error.code === '23505') {
				throw new ConflictError('Email already registered');
			}
			throw error;
		}
		const accessToken = await signAccessToken(userId);
		authTokensIssuedTotal.inc({ type: 'access', service: env.SERVICE_NAME });
		const { raw: refreshToken, tokenHash, expiresAt } = await generateRefreshToken();
		await this.authRepository.createRefreshToken({ userId, tokenHash, expiresAt });
		authTokensIssuedTotal.inc({ type: 'refresh', service: env.SERVICE_NAME });
		await cacheToken(refreshToken, userId, ACCESS_TOKEN_TTL_SEC);
		logger.info({ userId, tokenType: 'access' }, 'Token issued');
		return { accessToken, refreshToken, userId };
	}

	async login(input: LoginRequest): Promise<{ accessToken: string; refreshToken: string }> {
		const user = await this.authRepository.getUserByEmail(input.body.email);
		if (!user) {
			logger.warn({ reason: 'invalid_credentials', email: input.body.email }, 'Auth failure');
			authFailuresTotal.inc({ reason: 'invalid_credentials', service: env.SERVICE_NAME });
			throw new AppError('Invalid credentials', httpStatus.UNAUTHORIZED);
		}
		const isValid = await bcrypt.compare(input.body.password, user.password_hash);
		if (!isValid) {
			logger.warn({ reason: 'invalid_credentials', email: input.body.email }, 'Auth failure');
			authFailuresTotal.inc({ reason: 'invalid_credentials', service: env.SERVICE_NAME });
			throw new AppError('Invalid credentials', httpStatus.UNAUTHORIZED);
		}
		const accessToken = await signAccessToken(user.id);
		authTokensIssuedTotal.inc({ type: 'access', service: env.SERVICE_NAME });
		const { raw: refreshToken, tokenHash, expiresAt } = await generateRefreshToken();
		await this.authRepository.createRefreshToken({ userId: user.id, tokenHash, expiresAt });
		authTokensIssuedTotal.inc({ type: 'refresh', service: env.SERVICE_NAME });
		await cacheToken(refreshToken, user.id, ACCESS_TOKEN_TTL_SEC);
		return { accessToken, refreshToken };
	}

	async refresh(input: RefreshRequest): Promise<{ accessToken: string }> {
		const { refreshToken } = input.body;
		const tokenHash = hashRefreshToken(refreshToken);
		const user = await this.authRepository.getUserByRefreshToken(tokenHash);
		if (!user) {
			throw new AppError('Invalid refresh token', httpStatus.UNAUTHORIZED);
		}
		const accessToken = await signAccessToken(user.user_id);
		authTokensIssuedTotal.inc({ type: 'access', service: env.SERVICE_NAME });
		await cacheToken(accessToken, user.user_id, ACCESS_TOKEN_TTL_SEC);
		return { accessToken };
	}
}

export const authService = new AuthService();
