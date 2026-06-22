import { describe, test, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { contextMiddleware } from '@/middleware/context';

vi.mock('node:crypto', () => {
	return {
		randomUUID: vi.fn().mockReturnValue('test-correlation-id'),
	};
});

const setupTest = () => {
	const setHeader = vi.fn();
	const res = { setHeader } as unknown as Response;
	const next = vi.fn();
	return {
		setHeader,
		getReq: (value: string) => {
			return { header: vi.fn().mockReturnValue(value) } as unknown as Request;
		},
		res,
		next,
	};
};

describe('contextMiddleware', () => {
	test('sets a correlation id on the response from request header', () => {
		const { setHeader, getReq, res, next } = setupTest();
		const req = getReq('123');
		contextMiddleware(req, res, next);
		expect(setHeader).toHaveBeenCalledWith('x-correlation-id', '123');
		expect(next).toHaveBeenCalled();
	});

	test('sets a correlation id on the response from random UUID', () => {
		const { setHeader, getReq, res, next } = setupTest();
		const req = getReq('');
		contextMiddleware(req, res, next);
		expect(setHeader).toHaveBeenCalledWith('x-correlation-id', 'test-correlation-id');
		expect(next).toHaveBeenCalled();
	});
});
