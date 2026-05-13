import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { exportJWK } from 'jose';

const KID = `key-${new Date().toISOString().slice(0, 7)}`;

const { privateKey: rawPrivate, publicKey: rawPublic } = generateKeyPairSync('rsa', {
	modulusLength: 2048,
	publicKeyEncoding: { type: 'spki', format: 'pem' },
	privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

export const privateKey = createPrivateKey(rawPrivate);
export const publicKey = createPublicKey(rawPublic);
export const kid = KID;

let jwksCache: { keys: object[] } | null = null;

export async function getJWKS(): Promise<{ keys: object[] }> {
	if (jwksCache) return jwksCache;
	const jwk = await exportJWK(publicKey);
	jwksCache = { keys: [{ ...jwk, kid, use: 'sig', alg: 'RS256' }] };
	return jwksCache;
}
