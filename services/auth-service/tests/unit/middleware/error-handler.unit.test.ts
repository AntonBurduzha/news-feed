import { describe, test, expect, vi } from 'vitest';
import httpStatus from 'http-status';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { errorHandler, notFoundHandler } from '@/middleware/error-handler';
import { AppError, ConflictError, NotFoundError, ValidationError } from '@/lib/errors';

const setupTest = () => {
	const status = vi.fn().mockReturnThis();
	const json = vi.fn();
	const res = { status, json } as unknown as Response;
	const req = {
		log: { error: vi.fn() },
		method: 'GET',
		originalUrl: '/test',
	} as unknown as Request;
	const next = vi.fn();
	return { status, json, res, req, next };
};

describe('errorHandler', () => {
	test('handles ZodError', () => {
		const { status, json, res, req, next } = setupTest();
		const error = new ZodError([{ path: ['test'], message: 'test', code: 'custom' }]);
		errorHandler(error, req, res, next);
		const details = error.issues.map(issue => ({
			path: issue.path.join('.'),
			message: issue.message,
		}));
		const validationError = new ValidationError('Validation failed', details);
		expect(status).toHaveBeenCalledWith(validationError.statusCode);
		expect(json).toHaveBeenCalledWith({
			error: validationError.message,
			details: validationError.details,
		});
	});

	test('handles AppError', () => {
		const { status, json, res, req, next } = setupTest();
		const error = new AppError('Test error', 400);
		errorHandler(error, req, res, next);
		expect(status).toHaveBeenCalledWith(error.statusCode);
		expect(json).toHaveBeenCalledWith({
			error: error.message,
			details: error.details,
		});
	});

	test('handles ConflictError', () => {
		const { status, json, res, req, next } = setupTest();
		const error = new ConflictError('Test error');
		errorHandler(error, req, res, next);
		expect(status).toHaveBeenCalledWith(error.statusCode);
		expect(json).toHaveBeenCalledWith({
			error: error.message,
			details: error.details,
		});
	});

	test('handles unknown errors', () => {
		const { status, json, res, req, next } = setupTest();
		const error = new Error('Test error');
		errorHandler(error, req, res, next);
		expect(status).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR);
		expect(json).toHaveBeenCalledWith({
			error: 'Internal server error',
		});
	});
});

describe('notFoundHandler', () => {
	test('returns a 404 error', () => {
		const { res, req, next } = setupTest();
		notFoundHandler(req, res, next);
		const notFoundError = new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`);
		expect(next).toHaveBeenCalledWith(notFoundError);
	});
});
