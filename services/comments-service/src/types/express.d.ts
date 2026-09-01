import type { UserContext } from '@news-feed/auth-client';

declare global {
	namespace Express {
		interface Request {
			user?: UserContext;
		}
	}
}

export {};
