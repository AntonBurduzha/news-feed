import type { RequestHandler, IRoute } from 'express';
import { httpRequestsTotal, httpRequestDuration, httpRequestErrorsTotal } from '@/lib/metrics';
import { env } from '@/config/env';

export const metricsMiddleware: RequestHandler = (req, res, next) => {
	const end = httpRequestDuration.startTimer();
	res.on('finish', () => {
		const route = (req.route as IRoute)?.path ?? req.path;
		const labels = {
			method: req.method,
			route,
			status_code: String(res.statusCode),
			service: env.SERVICE_NAME,
		};
		httpRequestsTotal.inc(labels); // RED rate increment
		end(labels); // measure RED duration
		if (res.statusCode >= 500) {
			httpRequestErrorsTotal.inc({
				method: req.method,
				route,
				service: env.SERVICE_NAME,
			}); // RED errors increment
		}
	});

	next();
};
