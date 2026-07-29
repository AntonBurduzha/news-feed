import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import healthRoute from '@/routes/health.route';
import metricsRoute from '@/routes/metrics.route';
import feedRoutes from '@/modules/feed/feed.routes';
import { httpLogger, logger } from '@/lib/logger';
import { errorHandler, notFoundHandler } from '@/middleware/error-handler';
import { metricsMiddleware } from '@/middleware/metrics';
import { contextMiddleware, requestContext } from '@/middleware/context';
import { createAuthClient, type UserContext } from '@news-feed/auth-client';
import { env } from '@/config/env';

export const authClient = createAuthClient({
	jwksUrl: env.AUTH_JWKS_URL,
	issuer: env.AUTH_ISSUER,
	audience: env.AUTH_AUDIENCE,
	serviceName: env.SERVICE_NAME,
	redisUrl: env.REDIS_URL,
	logger: {
		error: (obj: Record<string, unknown>, msg: string) => logger.error(obj, msg),
		warn: (obj: Record<string, unknown>, msg: string) => logger.warn(obj, msg),
		info: (obj: Record<string, unknown>, msg: string) => logger.info(obj, msg),
		debug: (obj: Record<string, unknown>, msg: string) => logger.debug(obj, msg),
	},
});

const app = express();
app.disable('x-powered-by');
app.use(contextMiddleware);
app.use(httpLogger);
app.use(metricsMiddleware);
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(compression());
app.use(express.json({ limit: '1mb' }));

// Public routes
app.use(healthRoute);
app.use(metricsRoute);

app.use(authClient.middleware());
app.use((req, _res, next) => {
	const store = requestContext.getStore();
	if (store) store.userId = (req as express.Request & { user?: UserContext }).user?.userId;
	next();
});

app.use('/feed', feedRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
