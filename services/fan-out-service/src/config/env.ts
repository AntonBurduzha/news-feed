import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
	PORT: z.coerce.number().int().positive().default(3004),
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
	LOG_HTTP_INFRA: z
		.enum(['true', 'false'])
		.default('false')
		.transform(v => v === 'true'),
	SERVICE_NAME: z.string().min(1).default('fan-out-service'),
	REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
	AUTH_JWKS_URL: z.string().min(1),
	AUTH_ISSUER: z.string().min(1),
	AUTH_AUDIENCE: z.string().min(1).default('news-feed'),
	KAFKA_NEWS_FEED_SERVICE_CLIENT_ID: z.string().min(5),
	KAFKA_BROKERS: z.string().optional(),
	MONOLITH_URL: z.string().min(1),
	INTERNAL_API_KEY: z.string().min(1),
});

const parsedEnv = envSchema.safeParse(process.env);
if (!parsedEnv.success) {
	throw new Error(`Invalid environment configuration: ${z.prettifyError(parsedEnv.error)}`);
}

const kafkaBrokers = parsedEnv.data.KAFKA_BROKERS?.split(',')
	.map(b => b.trim())
	.filter(Boolean);

export const env = {
	...parsedEnv.data,
	KAFKA_BROKERS: kafkaBrokers?.length ? kafkaBrokers : ['127.0.0.1:9092'],
	isProduction: parsedEnv.data.NODE_ENV === 'production',
} as const;
