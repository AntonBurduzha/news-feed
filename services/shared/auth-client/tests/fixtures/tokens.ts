import type { UserContext } from '../../src/index.js';

export const TEST_ISSUER = 'auth-svc';
export const TEST_AUDIENCE = 'news-feed';
export const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';
export const TEST_JWKS_URL = 'http://127.0.0.1:9999/.well-known/jwks.json';
export const TEST_REDIS_URL = 'redis://localhost:6379';

export const sampleToken = 'eyJhbGciOiJSUzI1NiJ9.sample.payload';
export const sampleBearer = `Bearer ${sampleToken}`;

export const cachedUserContext: UserContext = {
	userId: TEST_USER_ID,
	tokenExp: Math.floor(Date.now() / 1000) + 300,
};

export const defaultAuthClientCfg = {
	jwksUrl: TEST_JWKS_URL,
	issuer: TEST_ISSUER,
	audience: TEST_AUDIENCE,
	redisUrl: TEST_REDIS_URL,
};
