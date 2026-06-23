import { DatabaseError } from 'pg';
import httpStatus from 'http-status';
import bcrypt from 'bcrypt';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
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
		const span = tracer.startSpan('auth.register', {
			attributes: { 'auth.email': input.body.email },
		});
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
				await cacheToken(refreshToken, userId, ACCESS_TOKEN_TTL_SEC);
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
				const user = await this.authRepository.getUserByRefreshToken(tokenHash);
				if (!user) {
					throw new AppError('Invalid refresh token', httpStatus.UNAUTHORIZED);
				}
				const accessToken = await signAccessToken(user.user_id);
				authTokensIssuedTotal.inc({ type: 'access', service: env.SERVICE_NAME });
				await cacheToken(accessToken, user.user_id, ACCESS_TOKEN_TTL_SEC);
				span.setAttribute('user.id', user.user_id);
				return { accessToken };
			} catch (error) {
				span.recordException(error as Error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
				throw error;
			} finally {
				span.end();
			}
		});
	}
}

export const authService = new AuthService();
