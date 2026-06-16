import { randomUUID } from 'node:crypto';
import { trace } from '@opentelemetry/api';
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

const INFRA_PATHS = new Set(['/metrics', '/healthz', '/readyz']);

function slimAccessReqSerializer(req: SerializedHttpReq) {
	return {
		id: req.id,
		method: req.method,
		url: req.url,
	};
}

function slimAccessResSerializer(res: SerializedHttpRes) {
	return res.statusCode;
}

function getTraceLogFields(): { traceId?: string; spanId?: string } {
	const spanContext = trace.getActiveSpan()?.spanContext();
	if (
		spanContext == null ||
		spanContext.traceId === '00000000000000000000000000000000' ||
		spanContext.spanId === '0000000000000000'
	) {
		return {};
	}
	return {
		traceId: spanContext.traceId,
		spanId: spanContext.spanId,
	};
}

const baseOptions = {
	level: env.LOG_LEVEL,
	base: {
		service: env.SERVICE_NAME,
	},
	mixin: () => ({
		correlationId: requestContext.getStore()?.correlationId,
		userId: requestContext.getStore()?.userId ?? 'anon',
		...getTraceLogFields(),
	}),
	formatters: {
		level(label: string) {
			return { level: label };
		},
	},
	redact: {
		paths: [
			'req.headers.authorization',
			'req.headers.cookie',
			'*.password',
			'*.token',
			'*.accessToken',
			'*.refreshToken',
		],
		censor: '[REDACTED]',
	},
};

const loggerOptions = env.isProduction
	? baseOptions
	: {
			...baseOptions,
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
	autoLogging: {
		ignore: req => !env.LOG_HTTP_INFRA && INFRA_PATHS.has((req.url ?? '').split('?')[0]),
	},
	customLogLevel: (_req, res, err) => {
		if (err || res.statusCode >= 500) return 'error';
		if (res.statusCode >= 400) return 'warn';
		return 'info';
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
