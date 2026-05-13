import { randomBytes, createHash } from 'node:crypto';
import { SignJWT } from 'jose';
import bcrypt from 'bcrypt';
import { privateKey, kid } from '@/config/keys';
import { env } from '@/config/env';

const BCRYPT_ROUNDS = 12;
export const ACCESS_TOKEN_TTL_SEC = 300; // 5 minutes
const REFRESH_TOKEN_TTL_DAYS = 7;

export function hashRefreshToken(raw: string): string {
	return createHash('sha256').update(raw).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function signAccessToken(userId: string): Promise<string> {
	return new SignJWT({ sub: userId })
		.setProtectedHeader({ alg: 'RS256', kid })
		.setIssuer(env.JWT_ISSUER)
		.setAudience(env.JWT_AUDIENCE)
		.setIssuedAt()
		.setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
		.sign(privateKey);
}

export async function generateRefreshToken(): Promise<{
	raw: string;
	tokenHash: string;
	expiresAt: Date;
}> {
	const raw = randomBytes(32).toString('base64url');
	const tokenHash = hashRefreshToken(raw);
	const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
	return { raw, tokenHash, expiresAt };
}
