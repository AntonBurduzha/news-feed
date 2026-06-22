import { describe, test, expect } from 'vitest';
import { registerSchema, loginSchema, refreshSchema } from '@/modules/auth/auth.schemas';
import { authFixtures } from '../../fixtures/auth';

describe('Auth Schemas', () => {
	test('accepts a valid register request', () => {
		const result = registerSchema.safeParse(authFixtures.newUserInput);
		expect(result.success).toBe(true);
	});

	test('rejects a too-short password', () => {
		const result = registerSchema.safeParse(authFixtures.invalidNewUserInput);
		expect(result.success).toBe(false);
	});

	test('accepts a valid login request', () => {
		const result = loginSchema.safeParse(authFixtures.loginInput);
		expect(result.success).toBe(true);
	});

	test('rejects a too-short password', () => {
		const result = loginSchema.safeParse(authFixtures.invalidLoginInput);
		expect(result.success).toBe(false);
	});

	test('accepts a valid refresh request', () => {
		const result = refreshSchema.safeParse(authFixtures.refreshInput);
		expect(result.success).toBe(true);
	});

	test('rejects a too-short refresh token', () => {
		const result = refreshSchema.safeParse(authFixtures.invalidRefreshInput);
		expect(result.success).toBe(false);
	});
});
