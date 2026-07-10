import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '@/config/env';

export const internalAuth: RequestHandler = (req, res, next) => {
	const provided = req.header('x-internal-api-key') ?? '';
	const expected = env.INTERNAL_API_KEY;
	if (
		provided.length !== expected.length ||
		!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
	) {
		return res.status(401).json({ error: 'Invalid internal key' });
	}
	next();
};
