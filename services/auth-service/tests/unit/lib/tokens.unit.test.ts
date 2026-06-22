import { describe, test, expect } from 'vitest';
import { hashRefreshToken, generateRefreshToken } from '@/lib/tokens';

describe('hashRefreshToken', () => {
	test('is deterministic', () => {
		const a = hashRefreshToken('secret-token');
		let b = hashRefreshToken('secret-token');
		expect(a).toBe(b);
		b = hashRefreshToken('secret-token1');
		expect(a).not.toBe(b);
	});
});

describe('generateRefreshToken', () => {
	test('returns a raw token, its hash, and expiry date', async () => {
		const before = Date.now();
		const { raw, tokenHash, expiresAt } = await generateRefreshToken();
		expect(raw).toBeTypeOf('string');
		expect(tokenHash).toBe(hashRefreshToken(raw));
		const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
		expect(expiresAt.getTime()).toBeGreaterThan(before + sevenDaysMs - 1);
	});
});
