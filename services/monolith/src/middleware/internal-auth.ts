import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '@/config/env';

const expectedKeyHash = crypto.createHash('sha256').update(env.INTERNAL_API_KEY).digest();

export const internalAuth: RequestHandler = (req, res, next) => {
	const provided = req.header('x-internal-api-key') ?? '';
	const providedHash = crypto.createHash('sha256').update(provided).digest();
	// INFO: prevent attacker from using timing attack to guess the key
	if (!crypto.timingSafeEqual(providedHash, expectedKeyHash)) {
		return res.status(401).json({ error: 'Invalid internal key' });
	}

	next();
};
