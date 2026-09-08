import {
	createHash,
	createPrivateKey,
	createPublicKey,
	generateKeyPairSync,
	type KeyObject,
} from 'node:crypto';
import { exportJWK } from 'jose';
import { env } from '@/config/env';

function decodePem(b64: string): string {
	return Buffer.from(b64, 'base64').toString('utf-8');
}

function fingerprint(pub: KeyObject): string {
	return createHash('sha256')
		.update(pub.export({ type: 'spki', format: 'der' }))
		.digest('base64url')
		.slice(0, 16);
}

function loadKeys() {
	if (env.JWT_PRIVATE_KEY_B64 && env.JWT_PUBLIC_KEY_B64) {
		const priv = createPrivateKey(decodePem(env.JWT_PRIVATE_KEY_B64));
		const pub = createPublicKey(decodePem(env.JWT_PUBLIC_KEY_B64));
		return { priv, pub, kid: env.JWT_KEY_ID ?? fingerprint(pub), ephemeral: false };
	}

	if (env.NODE_ENV === 'production') {
		throw new Error('JWT_PRIVATE_KEY_B64 / JWT_PUBLIC_KEY_B64 are required in production');
	}

	const { privateKey, publicKey } = generateKeyPairSync('rsa', {
		modulusLength: 2048,
		publicKeyEncoding: { type: 'spki', format: 'pem' },
		privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	});
	const pub = createPublicKey(publicKey);
	return { priv: createPrivateKey(privateKey), pub, kid: fingerprint(pub), ephemeral: true };
}

const loaded = loadKeys();

export const privateKey = loaded.priv;
export const publicKey = loaded.pub;
export const kid = loaded.kid;
export const usingEphemeralKey = loaded.ephemeral;

let jwksCache: { keys: object[] } | null = null;

export async function getJWKS(): Promise<{ keys: object[] }> {
	if (jwksCache) return jwksCache;

	const keys: object[] = [{ ...(await exportJWK(publicKey)), kid, use: 'sig', alg: 'RS256' }];
	jwksCache = { keys };
	return jwksCache;
}
