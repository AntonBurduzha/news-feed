import { DatabaseError } from 'pg';
import httpStatus from 'http-status';
import bcrypt from 'bcrypt';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { env } from '@/config/env';
import { AppError, ConflictError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { authFailuresTotal, authTokensIssuedTotal } from '@/lib/metrics';
import {
	hashRefreshToken,
	hashPassword,
	generateRefreshToken,
	signAccessToken,
} from '@/lib/tokens';
import { authRepository } from './auth.repository';
import type {
	LoginRequest,
	RegisterRequest,
	RefreshRequest,
	RegisterResult,
	LoginResult,
	RefreshResult,
} from './auth.types';

const tracer = trace.getTracer('auth-service');

class AuthService {
	private readonly authRepository;
	constructor() {
		this.authRepository = authRepository;
	}

	async register(input: RegisterRequest): Promise<RegisterResult> {
		const span = tracer.startSpan('auth.register');
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const passwordHash = await hashPassword(input.body.password);
				let userId: string;
				try {
					userId = await this.authRepository.createUser({
						email: input.body.email,
						passwordHash,
					});
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
				span.setAttribute('user.id', userId);
				logger.info({ userId, tokenType: 'access' }, 'Token issued');
				return { accessToken, refreshToken, userId };
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
				throw error;
			} finally {
				span.end();
			}
		});
	}

	async login(input: LoginRequest): Promise<LoginResult> {
		const span = tracer.startSpan('auth.login', {
			attributes: { 'auth.email': input.body.email },
		});
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const user = await this.authRepository.getUserByEmail(input.body.email);
				if (!user) {
					logger.warn({ reason: 'invalid_credentials' }, 'Auth failure');
					authFailuresTotal.inc({ reason: 'invalid_credentials', service: env.SERVICE_NAME });
					throw new AppError('Invalid credentials', httpStatus.UNAUTHORIZED);
				}
				const isValid = await bcrypt.compare(input.body.password, user.password_hash);
				if (!isValid) {
					logger.warn({ reason: 'invalid_credentials' }, 'Auth failure');
					authFailuresTotal.inc({ reason: 'invalid_credentials', service: env.SERVICE_NAME });
					throw new AppError('Invalid credentials', httpStatus.UNAUTHORIZED);
				}
				const accessToken = await signAccessToken(user.id);
				authTokensIssuedTotal.inc({ type: 'access', service: env.SERVICE_NAME });
				const { raw: refreshToken, tokenHash, expiresAt } = await generateRefreshToken();
				await this.authRepository.createRefreshToken({ userId: user.id, tokenHash, expiresAt });
				authTokensIssuedTotal.inc({ type: 'refresh', service: env.SERVICE_NAME });
				span.setAttribute('user.id', user.id);
				return { accessToken, refreshToken };
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
				throw error;
			} finally {
				span.end();
			}
		});
	}

	async refresh(input: RefreshRequest): Promise<RefreshResult> {
		const span = tracer.startSpan('auth.refresh');
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const { refreshToken } = input.body;
				const tokenHash = hashRefreshToken(refreshToken);
				const row = await this.authRepository.findRefreshToken(tokenHash);

				if (!row) {
					authFailuresTotal.inc({ reason: 'unknown_refresh_token', service: env.SERVICE_NAME });
					throw new AppError('Invalid refresh token', httpStatus.UNAUTHORIZED);
				}
				if (row.used_at !== null) {
					const revoked = await this.authRepository.revokeTokenFamily(row.family_id);
					authFailuresTotal.inc({ reason: 'refresh_token_reuse', service: env.SERVICE_NAME });
					span.setAttribute('security.token_reuse_detected', true);
					logger.error(
						{ userId: row.user_id, familyId: row.family_id, revokedCount: revoked },
						'Token family revoked',
					);
					throw new AppError('Invalid refresh token', httpStatus.UNAUTHORIZED);
				}
				if (row.revoked_at !== null) {
					authFailuresTotal.inc({ reason: 'refresh_token_revoked', service: env.SERVICE_NAME });
					throw new AppError('Invalid refresh token', httpStatus.UNAUTHORIZED);
				}
				if (new Date(row.expires_at).getTime() <= Date.now()) {
					authFailuresTotal.inc({ reason: 'refresh_token_expired', service: env.SERVICE_NAME });
					throw new AppError('Invalid refresh token', httpStatus.UNAUTHORIZED);
				}

				const claimed = await this.authRepository.markRefreshTokenUsed(row.id);
				if (!claimed) {
					await this.authRepository.revokeTokenFamily(row.family_id);
					authFailuresTotal.inc({ reason: 'refresh_token_reuse', service: env.SERVICE_NAME });
					throw new AppError('Invalid refresh token', httpStatus.UNAUTHORIZED);
				}
				const accessToken = await signAccessToken(row.user_id);
				const {
					raw: newRefreshToken,
					tokenHash: newHash,
					expiresAt,
				} = await generateRefreshToken();
				await this.authRepository.createRefreshToken({
					userId: row.user_id,
					tokenHash: newHash,
					expiresAt,
					familyId: row.family_id,
				});

				authTokensIssuedTotal.inc({ type: 'access', service: env.SERVICE_NAME });
				authTokensIssuedTotal.inc({ type: 'refresh', service: env.SERVICE_NAME });
				span.setAttribute('user.id', row.user_id);
				return { accessToken, refreshToken: newRefreshToken };
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
				throw error;
			} finally {
				span.end();
			}
		});
	}

	async logout(refreshToken: string): Promise<void> {
		const row = await this.authRepository.findRefreshToken(hashRefreshToken(refreshToken));
		if (!row) return;
		await this.authRepository.revokeTokenFamily(row.family_id);
		logger.info({ userId: row.user_id }, 'User logged out');
	}

	async deleteExpiredTokens(): Promise<number> {
		const span = tracer.startSpan('auth.deleteExpiredTokens');
		return context.with(trace.setSpan(context.active(), span), async () => {
			try {
				const deletedCount = await this.authRepository.deleteExpiredTokens();
				span.setAttribute('auth.deleted_count', deletedCount);
				return deletedCount;
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
				throw new AppError('Failed to delete expired tokens', httpStatus.INTERNAL_SERVER_ERROR);
			} finally {
				span.end();
			}
		});
	}
}

export const authService = new AuthService();
