import { describe, test, expect } from 'vitest';
import httpStatus from 'http-status';
import {
	normalizeError,
	NotFoundError,
	ValidationError,
	ConflictError,
	AppError,
} from '@/lib/errors';

describe('normalizeError', () => {
	test('passes Error through unchanged', () => {
		const err = new Error('boom');
		expect(normalizeError(err)).toBe(err);
	});

	test('wraps a string into an Error', () => {
		expect(normalizeError('oops')).toBeInstanceOf(Error);
		expect(normalizeError('oops').message).toBe('oops');
	});

	test('wraps a non-string into an Error', () => {
		expect(normalizeError(123)).toBeInstanceOf(Error);
		expect(normalizeError(123).message).toBe('Unknown error');
	});
});

describe('AppError subclasses', () => {
	test.each([
		[NotFoundError, httpStatus.NOT_FOUND, 'Resource not found'],
		[ValidationError, httpStatus.BAD_REQUEST, 'Validation failed'],
		[ConflictError, httpStatus.CONFLICT, 'Conflict'],
	])('%s carries its status code and default message', (Subclass, statusCode, message) => {
		const error = new Subclass();
		expect(error).toBeInstanceOf(AppError);
		expect(error.statusCode).toBe(statusCode);
		expect(error.message).toBe(message);
	});
});
