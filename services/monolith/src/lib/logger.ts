import { randomUUID } from 'node:crypto';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { env } from '@/config/env';
import { requestContext } from '@/middleware/context';

type SerializedHttpReq = {
	id?: string;
	method?: string;
	url?: string;
	remoteAddress?: string;
	remotePort?: number;
};

type SerializedHttpRes = {
	statusCode?: number | null;
	correlationId?: string;
};

function slimAccessReqSerializer(req: SerializedHttpReq) {
	return {
		id: req.id,
		method: req.method,
		url: req.url,
		// TODO: uncomment when finish microservices architecture
		// ...(req.remoteAddress != null && req.remoteAddress !== ''
		// 	? { remoteAddress: req.remoteAddress }
		// 	: {}),
	};
}

function slimAccessResSerializer(res: SerializedHttpRes) {
	return res.statusCode;
}

const loggerOptions = env.isProduction
	? {
			level: env.LOG_LEVEL,
			base: {
				service: env.SERVICE_NAME,
			},
			mixin: () => ({ correlationId: requestContext.getStore()?.correlationId }),
		}
	: {
			level: env.LOG_LEVEL,
			base: {
				service: env.SERVICE_NAME,
			},
			mixin: () => ({ correlationId: requestContext.getStore()?.correlationId }),
			transport: {
				target: 'pino-pretty',
				options: {
					singleLine: true,
					colorize: true,
					translateTime: 'SYS:standard',
					ignore: 'pid,hostname',
				},
			},
		};

export const logger = pino(loggerOptions);

export const httpLogger = pinoHttp({
	logger,
	serializers: {
		req: slimAccessReqSerializer,
		res: slimAccessResSerializer,
	},
	genReqId: (req: IncomingMessage, res: ServerResponse) => {
		const existingId = req.headers['x-request-id'];
		const requestId = Array.isArray(existingId)
			? (existingId[0] ?? randomUUID())
			: (existingId ?? randomUUID());
		res.setHeader('x-request-id', requestId);
		return requestId;
	},
});
