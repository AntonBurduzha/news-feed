import { generateKeyPairSync, createPrivateKey, createPublicKey } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { exportJWK, SignJWT } from 'jose';

export type TestKeyPair = {
	privateKey: KeyObject;
	publicKey: KeyObject;
	kid: string;
};

export function generateTestKeyPair(): TestKeyPair {
	const kid = 'test-key-1';
	const { privateKey: rawPrivate, publicKey: rawPublic } = generateKeyPairSync('rsa', {
		modulusLength: 2048,
		publicKeyEncoding: { type: 'spki', format: 'pem' },
		privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	});
	return {
		privateKey: createPrivateKey(rawPrivate),
		publicKey: createPublicKey(rawPublic),
		kid,
	};
}

export async function buildJwks(publicKey: KeyObject, kid: string) {
	const jwk = await exportJWK(publicKey);
	return { keys: [{ ...jwk, kid, use: 'sig', alg: 'RS256' }] };
}

export async function signTestAccessToken(opts: {
	sub: string;
	exp: number;
	issuer: string;
	audience: string;
	privateKey: KeyObject;
	kid: string;
}): Promise<string> {
	return new SignJWT({ sub: opts.sub })
		.setProtectedHeader({ alg: 'RS256', kid: opts.kid })
		.setIssuer(opts.issuer)
		.setAudience(opts.audience)
		.setIssuedAt()
		.setExpirationTime(opts.exp)
		.sign(opts.privateKey);
}
