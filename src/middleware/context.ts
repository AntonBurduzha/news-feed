import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

export type RequestContext = {
	correlationId: string;
	// TODO: extend with userId once auth-service lands
};

export const requestContext = new AsyncLocalStorage<RequestContext>();

export const contextMiddleware: RequestHandler = (req, res, next) => {
	const incoming = req.header('x-correlation-id');
	const correlationId = incoming && incoming.length > 0 ? incoming : randomUUID();
	res.setHeader('x-correlation-id', correlationId);

	requestContext.run({ correlationId }, next);
};
