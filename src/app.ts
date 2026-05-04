import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import routes from '@/routes';
import { httpLogger } from '@/lib/logger';
import { errorHandler, notFoundHandler } from '@/middleware/error-handler';
import { contextMiddleware } from '@/middleware/context';

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

app.use(routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
