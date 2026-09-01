import type { RequestHandler } from 'express';
import type { AuthClient } from '@news-feed/auth-client';

let defaultActorId: string | undefined;

export function setDefaultActor(userId: string): void {
	defaultActorId = userId;
}

export function createAuthClient(): AuthClient {
	const middleware = (): RequestHandler => (req, _res, next) => {
		const bearer = req.headers.authorization?.replace(/^Bearer /, '');
		const userId = bearer || defaultActorId;
		if (userId) {
			req.user = { userId, tokenExp: 0 };
		}
		next();
	};

	return {
		verify: async bearer => ({ userId: bearer, tokenExp: 0 }),
		middleware,
		disconnect: async () => {},
	};
}
