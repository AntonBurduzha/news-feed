import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

type RequestPayload = {
	body?: unknown;
	params?: unknown;
	query?: unknown;
};

export function validate(schema: ZodType<RequestPayload>): RequestHandler {
	return async (req, _res, next) => {
		try {
			const payload: RequestPayload = {
				body: req.body as unknown,
				params: req.params as unknown,
				query: req.query as unknown,
			};
			const parsed = await schema.parseAsync(payload);

			if (parsed.body !== undefined) {
				req.body = parsed.body;
			}

			if (parsed.params !== undefined) {
				req.params = parsed.params as typeof req.params;
			}

			if (parsed.query !== undefined) {
				req.query = parsed.query as typeof req.query;
			}

			next();
		} catch (error) {
			next(error);
		}
	};
}
