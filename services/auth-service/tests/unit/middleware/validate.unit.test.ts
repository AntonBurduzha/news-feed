import { describe, test, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { validate } from '@/middleware/validate';
import { z, ZodError } from 'zod';

const setupTest = () => {
	const getReq = (body: unknown, params: unknown, query: unknown) => {
		return { body, params, query } as unknown as Request;
	};
	const res = {} as Response;
	const next = vi.fn();
	const schemas = {
		body: z.object({ body: z.object({ name: z.string() }) }),
		params: z.object({ params: z.object({ id: z.string() }) }),
		query: z.object({ query: z.object({ page: z.number() }) }),
	};
	return { getReq, res, next, schemas };
};

describe('validate', () => {
	test('validates request body', async () => {
		const { getReq, res, next, schemas } = setupTest();
		let req = getReq({ name: 'test' }, {}, {});
		await validate(schemas.body)(req, res, next);
		expect(next).toHaveBeenCalledWith();
		req = getReq({ name: { invalid: 'test' } }, {}, {});
		await validate(schemas.body)(req, res, next);
		expect(next).toHaveBeenCalledWith(expect.any(ZodError));
	});

	test('validates request params', async () => {
		const { getReq, res, next, schemas } = setupTest();
		let req = getReq({}, { id: '123' }, {});
		await validate(schemas.params)(req, res, next);
		expect(next).toHaveBeenCalledWith();
		req = getReq({}, { id: 21 }, {});
		await validate(schemas.params)(req, res, next);
		expect(next).toHaveBeenCalledWith(expect.any(ZodError));
	});

	test('validates request query', async () => {
		const { getReq, res, next, schemas } = setupTest();
		let req = getReq({}, {}, { page: 1 });
		await validate(schemas.query)(req, res, next);
		expect(next).toHaveBeenCalledWith();
		req = getReq({}, {}, { page: '21' });
		await validate(schemas.query)(req, res, next);
		expect(next).toHaveBeenCalledWith(expect.any(ZodError));
	});
});
