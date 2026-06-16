import { Router, type RequestHandler } from 'express';
import { env } from '@/config/env';
import { requestContext } from '@/middleware/context';

const router = Router();

const proxy: RequestHandler = async (req, res, next) => {
	const correlationId = requestContext.getStore()?.correlationId ?? '';
	const upstream = `${env.COMMENTS_SVC_URL}${req.originalUrl}`;
	try {
		const response = await fetch(upstream, {
			method: req.method,
			headers: {
				'content-type': req.header('content-type') ?? 'application/json',
				authorization: req.header('authorization') ?? '',
				'x-correlation-id': correlationId,
			},
			body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
			signal: AbortSignal.timeout(10000),
		});
		const body = await response.text();
		const contentType = response.headers.get('content-type');
		if (contentType) {
			res.set('content-type', contentType);
		}
		res.status(response.status).send(body);
	} catch (err) {
		if (err instanceof DOMException && err.name === 'AbortError') {
			res.status(504).send('Gateway Timeout');
		}
		if (err instanceof TypeError) {
			res.status(502).send('Bad Gateway');
		}
		next(err);
	}
};

router.use('/', proxy);
export default router;
