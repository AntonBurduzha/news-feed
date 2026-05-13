import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { httpLogger } from '@/lib/logger';
import { errorHandler, notFoundHandler } from '@/middleware/error-handler';
import { contextMiddleware, requestContext } from '@/middleware/context';
import { createAuthClient, type UserContext } from '@news-feed/auth-client';
import { env } from '@/config/env';
import healthRoute from '@/routes/health.route';
import userRoutes from '@/modules/users/users.routes';
import postRoutes from '@/modules/posts/posts.routes';
import followRoutes from '@/modules/follow/follow.routes';
import commentProxy from '@/modules/comments/comments.proxy';

export const authClient = createAuthClient({
	jwksUrl: env.AUTH_JWKS_URL,
	issuer: env.AUTH_ISSUER,
	audience: env.AUTH_AUDIENCE,
	redisUrl: env.REDIS_URL,
});

const app = express();

app.disable('x-powered-by');
app.use(contextMiddleware);
app.use(httpLogger);
app.use(helmet());
app.use(
	cors({
		origin: true,
		credentials: true,
	}),
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// INFO: Public routes
app.use(healthRoute);

app.use(authClient.middleware());
app.use((req, _res, next) => {
	const store = requestContext.getStore();
	if (store) {
		store.userId = (req as express.Request & { user?: UserContext }).user?.userId;
	}
	next();
});
// INFO: Protected routes
app.use('/users', userRoutes);
app.use('/posts', postRoutes);
app.use('/follows', followRoutes);
app.use('/comments', commentProxy);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
