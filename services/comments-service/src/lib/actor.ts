import type { Request } from 'express';
import httpStatus from 'http-status';
import { AppError } from '@/lib/errors';

export function actorId(req: Request): string {
	const userId = req.user?.userId;
	if (!userId) {
		throw new AppError('Unauthenticated', httpStatus.UNAUTHORIZED);
	}
	return userId;
}
