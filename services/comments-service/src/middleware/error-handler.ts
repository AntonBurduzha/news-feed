import type { ErrorRequestHandler, RequestHandler } from 'express';
import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
	next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
	if (error instanceof ZodError) {
		const details = error.issues.map(issue => ({
			path: issue.path.join('.'),
			message: issue.message,
		}));

		const validationError = new ValidationError('Validation failed', details);
		return res.status(validationError.statusCode).json({
			error: validationError.message,
			details: validationError.details,
		});
	}

	if (error instanceof mongoose.Error.ValidationError) {
		const details = Object.fromEntries(
			Object.entries(error.errors).map(([field, e]) => [field, e.message]),
		);
		const validationError = new ValidationError('Validation failed', details);
		return res.status(validationError.statusCode).json({
			message: validationError.message,
			details: validationError.details,
		});
	}

	if (error instanceof AppError) {
		return res.status(error.statusCode).json({
			error: error.message,
			...(error.details ? { details: error.details } : {}),
		});
	}

	req.log.error({ err: error }, 'Unhandled request error');

	return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
		error: 'Internal server error',
	});
};
