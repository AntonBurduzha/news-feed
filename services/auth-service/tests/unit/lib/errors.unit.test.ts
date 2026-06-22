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

describe('NotFoundError', () => {
	test('extends AppError', () => {
		expect(new NotFoundError()).toBeInstanceOf(AppError);
		expect(new NotFoundError().statusCode).toBe(httpStatus.NOT_FOUND);
		expect(new NotFoundError().message).toBe('Resource not found');
	});
});

describe('ValidationError', () => {
	test('extends AppError', () => {
		expect(new ValidationError()).toBeInstanceOf(AppError);
		expect(new ValidationError().statusCode).toBe(httpStatus.BAD_REQUEST);
		expect(new ValidationError().message).toBe('Validation failed');
	});
});

describe('ConflictError', () => {
	test('extends AppError', () => {
		expect(new ConflictError()).toBeInstanceOf(AppError);
		expect(new ConflictError().statusCode).toBe(httpStatus.CONFLICT);
		expect(new ConflictError().message).toBe('Conflict');
	});
});
