import { describe, test, expect, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { asyncHandler } from '@/lib/async-handler';

const flush = () => new Promise(resolve => setImmediate(resolve));

const setupTest = () => {
	const status = vi.fn().mockReturnThis();
	const json = vi.fn();
	const req = { method: 'GET', url: '/test' } as Request;
	const res = { status, json } as unknown as Response;
	const next = vi.fn();
	return { status, json, req, res, next };
};

describe('asyncHandler', () => {
	test('resolves a promise with req, res, and next', async () => {
		const { req, res, next } = setupTest();
		const inner = vi.fn(async (_req: Request, res: Response) => {
			return res.status(200).json({ message: 'ok' });
		});
		const handler = asyncHandler(inner);
		handler(req, res, next);
		await flush();
		expect(inner).toHaveBeenCalledWith(req, res, next);
	});

	test('rejects a promise with an error and passes it to next', async () => {
		const boom = new Error('boom');
		const handler = asyncHandler(async () => {
			throw boom;
		});
		const next = vi.fn() as unknown as NextFunction;
		handler({} as Request, {} as Response, next);
		await flush();
		expect(next).toHaveBeenCalledTimes(1);
		expect(next).toHaveBeenCalledWith(boom);
	});
});
